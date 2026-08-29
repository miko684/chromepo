import { join } from 'path';
import { ProxyDB } from '../db/proxy';
import { WindowDB } from '../db/window';
// import {getChromePath} from './device';
import { BrowserWindow } from 'electron';
import puppeteer from 'puppeteer';
import type {Browser} from 'puppeteer';
import { execFile, execSync, spawn } from 'child_process';
import * as portscanner from 'portscanner';
import { sleep } from '../utils/sleep';
import SocksServer from '../proxy-server/socks-server';
import type { DB } from '../../../shared/types/db';
import { type IncomingMessage, type Server, type ServerResponse } from 'http';
import { createLogger } from '../../../shared/utils/logger';
import { WINDOW_LOGGER_LABEL } from '../constants';
import { db } from '../db';
import { getProxyInfo } from './prepare';
import * as ProxyChain from 'proxy-chain';
import { getSettings } from '../utils/get-settings';
// import {randomFingerprint} from '../services/window-service';
import { bridgeMessageToUI, getClientPort, getMainWindow } from '../mainWindow';
import { Mutex } from 'async-mutex';
// import {presetCookie} from '../puppeteer/helpers';
import { existsSync, mkdirSync } from 'fs';
import api from '../../../shared/api/api';
import { ExtensionDB } from '../db/extension';
import { getPort } from '../server';
import { applyFingerprintToPage, collectFingerprintHealthReport, normalizeFingerprint } from './advanced';

const mutex = new Mutex();

const logger = createLogger(WINDOW_LOGGER_LABEL);

const HOST = '127.0.0.1';

// A close request can race with the ChildProcess `close` event.  This guard
// keeps the cleanup idempotent and prevents duplicate taskkill/CDP requests.
const closingWindowIds = new Set<number>();
const connectedBrowsers = new Map<number, Browser>();

const isProcessAlive = (pid?: number | null) => {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const isDebugPortAlive = async (port?: number | null) => {
  if (!port || port <= 0) return false;
  try {
    const response = await api.get(`http://${HOST}:${port}/json/version`, {timeout: 800});
    return response.status === 200 && !!response.data?.webSocketDebuggerUrl;
  } catch {
    return false;
  }
};

const terminateProcessTree = async (pid?: number | null) => {
  if (!pid || pid <= 0 || !isProcessAlive(pid)) return;
  if (process.platform === 'win32') {
    await new Promise<void>(resolve => {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], {windowsHide: true}, () => resolve());
    });
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // The process may have exited between the liveness check and kill.
  }
};

/**
 * Reconcile persisted window state with the real Chromium process.  This is
 * intentionally local-only (PID + CDP port), so a stale database row can no
 * longer keep a window displayed as running after an app restart.
 */
export async function reconcileWindowRuntimeState() {
  const windows = await WindowDB.all();
  for (const window of windows) {
    const running = window.status === 2;
    const processAlive = isProcessAlive(window.pid);
    const portAlive = await isDebugPortAlive(window.port);

    if (running && processAlive && portAlive) continue;
    if (!running && !window.pid && !window.port && !window.opened_at && !window.local_proxy_port) continue;

    await WindowDB.updateRuntime(window.id!, {
      status: 1,
      port: null,
      pid: null,
      opened_at: null,
      local_proxy_port: null,
    });
    logger.info(`Reconciled stale runtime state for window ${window.id}`);
  }
}

// async function connectBrowser(
//   port: number,
//   ipInfo: IP,
//   windowId: number,
//   openStartPage: boolean = true,
// ) {
//   // const windowData = await WindowDB.getById(windowId);
//   const settings = getSettings();
//   const browserURL = `http://${HOST}:${port}`;
//   const {data} = await api.get(browserURL + '/json/version');
//   if (data.webSocketDebuggerUrl) {
//     const browser = await puppeteer.connect({
//       browserWSEndpoint: data.webSocketDebuggerUrl,
//       defaultViewport: null,
//     });

//     // if (!windowData.opened_at) {
//     //   await presetCookie(windowId, browser);
//     // }
//     await WindowDB.update(windowId, {
//       status: 2,
//       port: port,
//       opened_at: db.fn.now() as unknown as string,
//     });

//     browser.on('targetcreated', async target => {
//       const newPage = await target.page();
//       if (newPage) {
//         await newPage.waitForNavigation({waitUntil: 'networkidle0'});
//         if (!settings.useLocalChrome) {
//           await modifyPageInfo(windowId, newPage, ipInfo);
//         }
//       }
//     });
//     const pages = await browser.pages();
//     const page =
//       pages.length &&
//       (pages?.[0]?.url() === 'about:blank' ||
//         !pages?.[0]?.url() ||
//         pages?.[0]?.url() === 'chrome://new-tab-page/')
//         ? pages?.[0]
//         : await browser.newPage();
//     try {
//       if (!settings.useLocalChrome) {
//         await modifyPageInfo(windowId, page, ipInfo);
//       }
//       if (getClientPort() && openStartPage) {
//         await page.goto(
//           `http://localhost:${getClientPort()}/#/start?windowId=${windowId}&serverPort=${getPort()}`,
//         );
//       }
//     } catch (error) {
//       logger.error(error);
//     }
//     return data;
//   }
// }

const getDriverPath = () => {
  const settings = getSettings();

  if (settings.useLocalChrome) {
    return settings.localChromePath;
  } else {
    return settings.chromiumBinPath;
  }
};

const getAvailablePort = async () => {
  for (let attempts = 0; attempts < 10; attempts++) {
    try {
      const port = await portscanner.findAPortNotInUse(9222, 40222);
      return port; // 成功绑定后返回
    } catch (error) {
      console.log('Port already in use, retrying...');
    }
  }
  throw new Error('Failed to find a free port after multiple attempts');
};

const waitForChromeReady = async (chromePort: number, id: number, maxAttempts = 30) => {
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      // 尝试连接 CDP
      const response = await api.get(`http://${HOST}:${chromePort}/json/version`, {
        timeout: 1000,
      });
      if (response.status === 200) {
        return true;
      }
    } catch (error) {
      logger.error('连接失败', (error as Error).message);
      // 连接失败，继续等待
    }

    attempts++;
    await sleep(0.5);
  }

  throw new Error('Chrome instance failed to start within the timeout period');
};

export async function openFingerprintWindow(id: number, headless = false) {
  const release = await mutex.acquire();
  try {
    const windowData = await WindowDB.getById(id);

    // 检查窗口是否已经打开
    if (windowData.status === 2 && windowData.port) {
      logger.info(`Window ${id} is already running on port ${windowData.port}`);
      try {
        const browserURL = `http://${HOST}:${windowData.port}`;
        const { data } = await api.get(browserURL + '/json/version');

        // 如果能成功获取到浏览器信息，说明窗口仍然可用
        if (data) {
          logger.info(`Window ${id} is already running on port ${windowData.port}`);
          // 获取浏览器实例，把窗口放到最前面
          const browser = await puppeteer.connect({
            browserWSEndpoint: data.webSocketDebuggerUrl,
            defaultViewport: null,
          });
          connectedBrowsers.set(id, browser);
          const pages = await browser.pages();
          if (pages.length > 0) {
            await pages[0].bringToFront();
            // 取消连接
            await browser.disconnect();
          }
          return {
            ...data,
          };
        }
      } catch (error) {
        // 如果获取失败，说明窗口虽然标记为打开但实际已关闭
        logger.warn(`Window ${id} marked as running but not accessible, will reopen`);
        await WindowDB.updateRuntime(id, {
          status: 1,
          port: null,
          pid: null,
          opened_at: null,
          local_proxy_port: null,
        });
      }
    }

    const extensionData = await ExtensionDB.getExtensionsByWindowId(id);
    const proxyData = await ProxyDB.getById(windowData.proxy_id);
    const proxyType = proxyData?.proxy_type?.toLowerCase();
    const settings = getSettings();

    // Never silently fall back to a direct connection for a Mihomo-managed
    // node. A missing local port means the node was imported through an older
    // path or the core has not finished loading yet; fail closed and let the
    // user retry after Mihomo becomes ready.
    if (proxyData?.node_config && !proxyData.local_port) {
      const message = 'Mihomo 节点尚未分配本地代理端口，请先刷新 Mihomo 节点状态后重试';
      logger.error(`Window ${id} blocked: ${message}`);
      bridgeMessageToUI({type: 'error', text: message});
      return null;
    }

    const cachePath = settings.profileCachePath;

    const win = BrowserWindow.getAllWindows()[0];
    const windowDataDir = join(
      cachePath,
      settings.useLocalChrome ? 'chrome' : 'chromium',
      windowData.profile_id,
    );

    // 确保目录存在并设置正确权限
    if (!existsSync(windowDataDir)) {
      try {
        mkdirSync(windowDataDir, { recursive: true, mode: 0o755 });
      } catch (error) {
        logger.error(`Failed to create directory: ${error}`);
        return null;
      }
    }

    // 确保目录有正确的权限
    const isMac = process.platform === 'darwin';
    if (isMac) {
      try {
        execSync(`chmod -R 755 "${windowDataDir}"`);
      } catch (error) {
        logger.error(`Failed to set permissions: ${error}`);
        return null;
      }
    }

    const driverPath = getDriverPath();
    let ipInfo = { timeZone: '', ip: '', ll: [], country: '' };
    if (windowData.proxy_id && proxyData && (proxyData.ip || proxyData.node_config)) {
      ipInfo = await getProxyInfo(proxyData);
      if (!ipInfo?.ip) {
        logger.error('ipInfo is empty');
      }
    }

    // Do not open a Mihomo-backed environment when the selected node cannot
    // provide an exit IP. Starting it anyway leaves the user with a broken
    // proxy page and makes the failure look like a local-IP leak.
    if (proxyData?.node_config && !ipInfo?.ip) {
      const message = `所选节点当前无法获取公网 IP（${proxyData.status || '未知状态'}），请更换为活动节点后重试`;
      logger.error(`Window ${id} blocked: ${message}`);
      bridgeMessageToUI({type: 'error', text: message});
      return null;
    }

    const fingerprintConfig = normalizeFingerprint(
      windowData.fingerprintConfig || (windowData.fingerprint ? (() => { try { return JSON.parse(windowData.fingerprint!); } catch { return {}; } })() : {}),
    );

    // const fingerprint =
    //   windowData.fingerprint && windowData.fingerprint !== '{}'
    //     ? JSON.parse(windowData.fingerprint)
    //     : randomFingerprint();
    // if (!windowData.fingerprint || windowData.fingerprint === '{}') {
    //   await WindowDB.update(id, {
    //     ...windowData,
    //     fingerprint,
    //   });
    // }

    if (driverPath) {
      const chromePort = await getAvailablePort();
      let finalProxy: string | undefined;
      let proxyServer: Server<typeof IncomingMessage, typeof ServerResponse> | ProxyChain.Server | null = null;

      // ===== 🆕 优先检测 mihomo 节点 =====
      let isMihomoNode = false;
      let mihomoLocalPort: number | null = null;

      if (proxyData && proxyData.local_port) {
        // 这是 mihomo 节点
        isMihomoNode = true;
        mihomoLocalPort = proxyData.local_port;
        finalProxy = `http://127.0.0.1:${mihomoLocalPort}`;
        logger.info(`Window ${id} using mihomo node ${proxyData.remark || proxyData.proxy} on port ${mihomoLocalPort}`);

        // 🆕 通知 mihomo 服务记录绑定
        try {
          const { ipcMain } = require('electron');
          ipcMain.emit('mihomo-bind-window', id, proxyData.id, windowData.name || `window-${id}`);
          logger.info(`Window ${id} bound to mihomo node ${proxyData.id}`);
        } catch (e) {
          logger.error(`Failed to bind window ${id} to mihomo node:`, e);
        }
      } else if (proxyData && proxyType === 'socks5' && proxyData.proxy) {
        // 传统 SOCKS5 代理
        const proxyInstance = await createSocksProxy(proxyData);
        finalProxy = proxyInstance.proxyUrl;
        proxyServer = proxyInstance.proxyServer;
      } else if (proxyData && proxyType === 'http' && proxyData.proxy) {
        // 传统 HTTP 代理
        const proxyInstance = await createHttpProxy(proxyData);
        finalProxy = proxyInstance.proxyUrl;
        proxyServer = proxyInstance.proxyServer;
      }

      const isMac = process.platform === 'darwin';
      const launchParamter = settings.useLocalChrome
        ? [
          `--remote-debugging-port=${chromePort}`,
          `--user-data-dir=${windowDataDir}`,
          '--no-first-run',
        ]
        : [
          // Mac 特定参数
          ...(isMac ? ['--args'] : []),

          // `--extended-parameters=${btoa(JSON.stringify(fingerprint))}`,
          '--force-color-profile=srgb',
          '--no-first-run',
          '--no-default-browser-check',
          '--metrics-recording-only',
          '--disable-background-mode',
          `--remote-debugging-port=${chromePort}`,
          `--user-data-dir=${windowDataDir}`,
          // `--user-agent=${fingerprint?.ua}`,
          '--unhandled-rejections=strict',

          // Mac 特定安全参数
          ...(isMac ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
        ];

      // 🆕 添加代理参数（支持 mihomo 和传统代理）
      if (finalProxy) {
        launchParamter.push(`--proxy-server=${finalProxy}`);
        // 解决本地 DNS 解析问题，防止 DNS 泄露
        launchParamter.push('--host-resolver-rules="MAP * 0.0.0.0 , EXCLUDE localhost, EXCLUDE 127.0.0.1"');
        logger.info(`Window ${id} proxy args: --proxy-server=${finalProxy}`);
      }

      if (ipInfo?.timeZone && !settings.useLocalChrome) {
        launchParamter.push(`--timezone=${ipInfo.timeZone}`);
        launchParamter.push(`--tz=${ipInfo.timeZone}`);
      }
      if (extensionData.length > 0) {
        launchParamter.push(`--load-extension=${extensionData.map(e => e.path).join(',')}`);
      }
      if (headless) {
        launchParamter.push('--headless=new'); // 使用新版 headless 模式
        if (!isMac) {
          launchParamter.push('--disable-gpu'); // 在 Mac 上不需要这个参数
        }
      } else {
        launchParamter.push('--new-window');
        launchParamter.push(`http://localhost:${getClientPort()}/#/start?windowId=${id}&serverPort=${getPort()}`);
      }

      // 添加调试参数（如果需要）
      if (process.env.NODE_ENV === 'development') {
        // launchParamter.push(
        //   '--enable-logging',
        //   '--v=1',
        //   '--enable-blink-features=IdleDetection',
        // );
      }
      // const iconPath = await generateChromeIcon(windowDataDir, id);

      let chromeInstance;
      try {
        // if (isMac) {
        //   chromeInstance = spawn(driverPath, launchParamter);
        // } else {
        //   try {
        //     const shortcutPath = path.join(windowDataDir, `chrome-${windowData.id}.lnk`);
        //     await createShortcutWithIcon(driverPath, launchParamter, iconPath, shortcutPath);
        //     console.log('shortcutPath', shortcutPath);
        //     console.log('driverPath', driverPath);
        //     chromeInstance = spawn('cmd.exe', ['/c', 'start', '', shortcutPath]);
        //     console.log('chromeInstance', chromeInstance);
        //   } catch (error) {
        //     logger.error(error);
        //     chromeInstance = spawn(driverPath, launchParamter);
        //   }
        // }
        chromeInstance = spawn(driverPath, launchParamter);
      } catch (error) {
        logger.error(error);
      }
      if (!chromeInstance) {
        return;
      }
      await sleep(1);
      win.webContents.send('window-opened', id);
      chromeInstance.stdout.on('data', _chunk => {
        // const str = _chunk.toString();
        // console.error('stderr: ', str);
      });
      // 这个地方需要监听 stderr，否则在某些网站会出现卡死的情况
      chromeInstance.stderr.on('data', _chunk => {
        // const str = _chunk.toString();
        // console.error('stderr: ', str);
      });

      chromeInstance.on('close', async () => {
        logger.info(`Chrome process exited at port ${chromePort}, closed time: ${new Date()}`);

        // 🆕 如果是 mihomo 节点，通知 mihomo 服务释放绑定
        if (isMihomoNode && proxyData?.id) {
          try {
            const { ipcMain } = require('electron');
            ipcMain.emit('mihomo-unbind-window', id);
            logger.info(`Window ${id} unbound from mihomo node ${proxyData.id}`);
          } catch (e) {
            logger.error(`Failed to unbind window ${id}:`, e);
          }
        }

        if (proxyType === 'socks5' && proxyServer) {
          (proxyServer as Server<typeof IncomingMessage, typeof ServerResponse>)?.close(() => {
            logger.info('Socks5 Proxy server was closed.');
          });
        } else if (proxyType === 'http' && proxyServer) {
          (proxyServer as ProxyChain.Server).close(true, () => {
            logger.info('Http Proxy server was closed.');
          });
        }
        await closeFingerprintWindow(id, false);
      });

      await waitForChromeReady(chromePort, id, 30);

      try {
        const browserURL = `http://${HOST}:${chromePort}`;
        const { data } = await api.get(browserURL + '/json/version');

        // 🆕 如果是 mihomo 节点，保存 local_proxy_port 到 window 表
        const updateData: any = {
          ...windowData,
          status: 2,
          pid: chromeInstance.pid,
          port: chromePort,
          opened_at: db.fn.now() as unknown as string,
        };
        if (isMihomoNode && mihomoLocalPort) {
          updateData.local_proxy_port = mihomoLocalPort;
        }

        await WindowDB.update(windowData.id, updateData);

        // Apply the recovered advanced fingerprint layer through CDP after the
        // browser is ready. This keeps the stable Mihomo launch path intact
        // while ensuring every new environment receives the same identity.
        try {
          const browser = await puppeteer.connect({browserWSEndpoint: data.webSocketDebuggerUrl, defaultViewport: null});
          connectedBrowsers.set(windowData.id!, browser);
          const pages = await browser.pages();
          for (const page of pages) await applyFingerprintToPage(page, browser, fingerprintConfig, ipInfo);
          const report = pages[0] ? await collectFingerprintHealthReport(pages[0], fingerprintConfig, ipInfo) : null;
          if (report) {
            await WindowDB.updateFingerprint(
              windowData.id,
              JSON.stringify(fingerprintConfig),
              JSON.stringify(report),
            );
          }
          browser.on('targetcreated', async target => {
            try { const page = await target.page(); if (page) await applyFingerprintToPage(page, browser, fingerprintConfig, ipInfo); } catch (error) { logger.warn(`Fingerprint injection failed for new target: ${(error as Error).message}`); }
          });
          // Keep the Puppeteer connection alive so targetcreated can apply the
          // same fingerprint to popups and newly opened tabs.
        } catch (error) {
          logger.warn(`Advanced fingerprint setup skipped for window ${id}: ${(error as Error).message}`);
        }

        return {
          ...data,
        };
      } catch (error) {
        logger.error('open window failed', error);

        // 检查进程是否存在并终止
        if (chromeInstance.pid) {
          try {
            if (process.platform === 'win32') {
              try {
                // 使用 chcp 65001 设置控制台代码页为 UTF-8
                execSync('chcp 65001', { stdio: 'ignore' });

                // 检查进程是否存在
                execSync(`tasklist /FI "PID eq ${chromeInstance.pid}" /NH /FO CSV`, {
                  encoding: 'utf8',
                  stdio: ['ignore', 'pipe', 'ignore'],
                });

                // 进程存在，终止它
                execSync(`taskkill /PID ${chromeInstance.pid} /F /T`, {
                  encoding: 'utf8',
                  stdio: ['ignore', 'pipe', 'ignore'],
                });

                logger.info(`Successfully terminated process ${chromeInstance.pid}`);
              } catch (err) {
                if ((err as { status: number }).status === 128) {
                  logger.info(`Process ${chromeInstance.pid} does not exist`);
                } else {
                  throw err;
                }
              }
            } else {
              // Unix系统的处理保持不变
              try {
                process.kill(chromeInstance.pid, 0);
                execSync(`kill -9 ${chromeInstance.pid}`);
              } catch (err) {
                logger.info(`Process ${chromeInstance.pid} does not exist`);
              }
            }
          } catch (killError) {
            logger.error(`Failed to kill process ${chromeInstance.pid}:`, killError);
          }
        }

        // 🆕 如果是 mihomo 节点，释放绑定
        if (isMihomoNode && proxyData?.id) {
          try {
            const { ipcMain } = require('electron');
            ipcMain.emit('mihomo-unbind-window', id);
          } catch (e) {
            // ignore
          }
        }

        await closeFingerprintWindow(id, true);
        return null;
      }
    } else {
      bridgeMessageToUI({
        type: 'error',
        text: 'Driver path is empty',
      });
      logger.error('Driver path is empty');
      return null;
    }
  } finally {
    release();
  }
}

async function createHttpProxy(proxyData: DB.Proxy) {
  const listenPort = await portscanner.findAPortNotInUse(30000, 40000);
  const [httpHost, httpPort, username, password] = proxyData.proxy!.split(':');

  const oldProxyUrl = `http://${username}:${password}@${httpHost}:${httpPort}`;
  const newProxyUrl = await ProxyChain.anonymizeProxy({
    url: oldProxyUrl,
    port: listenPort,
  });
  const proxyServer = new ProxyChain.Server({
    port: listenPort,
  });

  return {
    proxyServer,
    proxyUrl: newProxyUrl,
  };
}

async function createSocksProxy(proxyData: DB.Proxy) {
  const listenHost = HOST;
  const listenPort = await portscanner.findAPortNotInUse(30000, 40000);
  const [socksHost, socksPort, socksUsername, socksPassword] = proxyData.proxy!.split(':');

  const proxyServer = SocksServer({
    listenHost,
    listenPort,
    socksHost,
    socksPort: +socksPort,
    socksUsername,
    socksPassword,
  });

  // 添加更多错误处理
  proxyServer.on('error', err => {
    logger.error('Socks server error:', err);
  });

  proxyServer.on('connect:error', err => {
    logger.error('Socks connect error:', err);
  });

  proxyServer.on('request:error', err => {
    logger.error('Socks request error:', err);
  });

  // 添加连接关闭处理
  proxyServer.on('close', () => {
    logger.info('Socks server closed');
  });

  return {
    proxyServer,
    proxyUrl: `http://${listenHost}:${listenPort}`,
  };
}

export async function resetWindowStatus(id: number) {
  await WindowDB.updateRuntime(id, {
    status: 1,
    port: null,
    pid: null,
    opened_at: null,
    local_proxy_port: null,
  });
}

export async function closeFingerprintWindow(id: number, force = false) {
  if (closingWindowIds.has(id)) return {success: true, message: 'Window close already in progress.'};
  closingWindowIds.add(id);
  const window = await WindowDB.getById(id);
  const port = window?.port;
  const pid = window?.pid;

  try {
    // Best effort graceful CDP close, followed by a guaranteed process-tree
    // termination.  The latter is required because browser.close() only closes
    // the Puppeteer connection reliably for some Chromium builds.
    if (force && port) {
      try {
        const {data} = await api.get(`http://${HOST}:${port}/json/version`, {timeout: 1000});
        if (data?.webSocketDebuggerUrl) {
          const browser = await puppeteer.connect({
            browserWSEndpoint: data.webSocketDebuggerUrl,
            defaultViewport: null,
          });
          // Ask Chromium to close itself first.  We still terminate the PID
          // below because some Chromium builds only close the CDP transport.
          await Promise.race([
            browser.close(),
            sleep(1.5),
          ]);
        }
      } catch (error) {
        logger.warn(`CDP close skipped for window ${id}: ${(error as Error).message}`);
      }
    }

    await terminateProcessTree(pid);
    const connected = connectedBrowsers.get(id);
    if (connected) { try { await connected.disconnect(); } catch {} connectedBrowsers.delete(id); }

    // Mihomo binding is released by the service's runtime cleanup on the next
    // health pass; never use ipcMain.emit() here because it does not invoke a
    // registered ipcMain.handle() callback.
    await WindowDB.updateRuntime(id, {
      status: 1,
      port: null,
      pid: null,
      opened_at: null,
      local_proxy_port: null,
    });
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send('window-closed', id);
  } finally {
    closingWindowIds.delete(id);
  }
}

export default {
  openFingerprintWindow,

  closeFingerprintWindow,
};
