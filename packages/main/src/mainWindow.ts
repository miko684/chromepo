import {app, BrowserWindow, ipcMain, nativeImage, shell} from 'electron';
import {join, resolve} from 'node:path';
import express from 'express';
import * as portscanner from 'portscanner';
import type {BridgeMessage} from '../../shared/types/common';
import {createLogger} from '../../shared/utils/logger';
import {MAIN_LOGGER_LABEL} from './constants';
import {existsSync} from 'fs';

const logger = createLogger(MAIN_LOGGER_LABEL);
const server = express();
const isDev = import.meta.env.DEV;
let serverStarted = false;
let PORT = 5173;

// 仅在生产环境下启动Express服务器
async function findAvailablePortAndStartServer() {
  if (!isDev) {
    PORT = await portscanner.findAPortNotInUse(5173, 8000);
    server.use(express.static(resolve(__dirname, '../../renderer/dist')));
    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      serverStarted = true;
    });
  }
}

async function createWindow() {
  // 区分安装版和免安装版的图标路径
  // 获取图标路径
  const getIconPath = () => {
    if (app.isPackaged) {
      const paths = [
        // 安装版路径
        join(app.getPath('exe'), '..', 'resources', 'buildResources', 'icon.ico'),
        // 备选路径
        join(process.resourcesPath, 'buildResources', 'icon.ico'),
        join(app.getAppPath(), 'buildResources', 'icon.ico'),
      ];

      // 使用第一个存在的图标路径
      for (const path of paths) {
        if (existsSync(path)) {
          return path;
        }
      }
    }
    // 开发环境路径
    return join(process.cwd(), 'buildResources', 'icon.ico');
  };

  const iconPath = getIconPath();

  // 确保图标文件存在
  if (!existsSync(iconPath)) {
    logger.error('Icon file not found:', iconPath);
  }

  const icon = nativeImage.createFromPath(iconPath);
  const browserWindow = new BrowserWindow({
    icon, // Windows
    width: import.meta.env.DEV ? 1600 : 1400,
    height: 930,
    minWidth: 920,
    minHeight: 700,
    frame: false,
    hasShadow: process.platform === 'win32',
    transparent: false,
    backgroundColor: 'rgba(255, 255, 255, 0)',
    movable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Sandbox disabled because the demo of preload script depend on the Node.js api
      webviewTag: false, // The webview tag is not recommended. Consider alternatives like an iframe or Electron's BrowserView. @see https://www.electronjs.org/docs/latest/api/webview-tag#warning
      webSecurity: false, // 禁用 web 安全策略，允许 file:// 协议加载本地资源
      allowRunningInsecureContent: true, // 允许运行不安全内容
      preload: join(app.getAppPath(), 'packages/preload/dist/index.cjs'),
    },
  });

  // ===== 🆕 添加所有错误监听钩子（用于诊断白屏问题） =====

  // 1. 监听 preload 脚本错误（最关键）
  browserWindow.webContents.on('preload-error', (_e, preloadPath, err) => {
    console.error('[preload-error]', preloadPath, err);
  });

  // 2. 监听渲染进程控制台输出
  browserWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${sourceId}:${line} ${message}`);
  });

  // 3. 监听渲染进程崩溃
  browserWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[render-process-gone]', details);
  });

  // 4. 监听页面加载失败
  browserWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription) => {
    console.error('[did-fail-load]', errorCode, errorDescription);
  });

  // 5. 页面加载完成后，强制以独立窗口打开 DevTools
  browserWindow.webContents.on('did-finish-load', () => {
    // 延迟 1 秒确保页面稳定
    setTimeout(() => {
      browserWindow.webContents.openDevTools({ mode: 'detach' });
    }, 1000);
  });

  // ===== 添加结束 =====

  if (process.platform === 'win32') {
    // 设置任务栏图标
    browserWindow.setIcon(icon);
    // 设置应用 ID，这对任务栏图标很重要
    // 设置应用 ID
    const appId = app.isPackaged ? 'com.chromepower.app' : process.execPath;
    app.setAppUserModelId(appId);

    browserWindow.setThumbarButtons([]);
  }

  // macOS 特定设置
  if (process.platform === 'darwin') {
    app.dock.setIcon(icon);
  }

  /**
   * If the 'show' property of the BrowserWindow's constructor is omitted from the initialization options,
   * it then defaults to 'true'. This can cause flickering as the window loads the html content,
   * and it also has show problematic behaviour with the closing of the window.
   * Use `show: false` and listen to the  `ready-to-show` event to show the window.
   *
   * @see https://github.com/electron/electron/issues/25012 for the afford mentioned issue.
   */
  browserWindow.on('ready-to-show', () => {
    browserWindow?.show();

    if (import.meta.env.DEV) {
      // browserWindow?.webContents.openDevTools();
    }
  });

  browserWindow.webContents?.on('will-navigate', (event, url) => {
    if (url !== browserWindow.webContents.getURL()) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  /**
   * icpMain
   */
  ipcMain?.handle('close', () => {
    const isMac = process.platform === 'darwin';
    if (!isMac) {
      browserWindow?.close();
    } else {
      app.quit();
    }
  });
  ipcMain?.handle('minimize', () => {
    browserWindow.minimize();
  });
  ipcMain?.handle('maximize', () => {
    if (browserWindow.isMaximized()) {
      browserWindow.unmaximize();
    } else {
      browserWindow.maximize();
    }
  });
  ipcMain?.handle('isMaximized', () => {
    return browserWindow.isMaximized();
  });

  /**
   * Load the main page of the main window.
   * 🆕 修改：开发模式下，支持通过环境变量指定 Vite 服务器地址
   */
  if (import.meta.env.DEV) {
    // 优先使用环境变量指定的 URL，否则默认使用 5173
    const devServerUrl = import.meta.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    await browserWindow.loadURL(devServerUrl);
  } else if (serverStarted) {
    await browserWindow.loadURL(`http://localhost:${PORT}/index.html`);
  } else {
    await browserWindow.loadFile(resolve(__dirname, '../../renderer/dist/index.html'));
  }

  return browserWindow;
}

export async function initApp() {
  await findAvailablePortAndStartServer();
  const mainWindow = await createWindow();
  return mainWindow;
}

export function getClientPort() {
  return PORT;
}

export function getMainWindow() {
  return BrowserWindow.getAllWindows()[0];
}

export function bridgeMessageToUI(msg: BridgeMessage) {
  const mainWindow = getMainWindow();
  mainWindow?.webContents.send('bridge-msg', msg);
}

/**
 * Restore an existing BrowserWindow or Create a new BrowserWindow.
 */
export async function restoreOrCreateWindow() {
  let window = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());

  if (window === undefined) {
    window = await initApp();
  }

  if (window.isMinimized()) {
    window.restore();
  }

  window.focus();
}