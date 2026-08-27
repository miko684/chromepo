import { spawn, ChildProcess } from 'child_process';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import net from 'net';
import { app } from 'electron';
import { ConfigGenerator } from './config-generator';
import type { ParsedNode } from './uri-parser';

/**
 * Mihomo 进程管理器
 * 负责启动、停止、重载 mihomo 核心进程
 */
export class MihomoManager {
  private process: ChildProcess | null = null;
  private configDir: string;
  private binaryPath: string;
  private apiSecret: string;
  private apiPort = 9090;
  private apiBase = 'http://127.0.0.1:9090';
  private ready = false;
  private startPromise: Promise<void> | null = null;

  constructor() {
    this.configDir = path.join(app.getPath('userData'), 'mihomo');
    this.binaryPath = this.getCoreBinary();
    // ✅ 先确保目录存在，再获取/生成密钥
    this.ensureDirectories();
    this.apiSecret = this.getOrCreateSecret();
  }

  /**
   * 获取核心二进制文件路径（跨平台）
   */
  private getCoreBinary(): string {
    const platform = process.platform;
    const arch = process.arch;

    // 开发环境从 resources 目录读取，打包后从用户数据目录读取
    let baseDir: string;
    if (app.isPackaged) {
      baseDir = path.join(process.resourcesPath, 'cores', 'mihomo');
    } else {
      baseDir = path.join(__dirname, '../../resources/cores/mihomo');
    }

    const map: Record<string, string> = {
      'win32-x64': 'win32-x64/mihomo.exe',
      'win32-arm64': 'win32-arm64/mihomo.exe',
      'darwin-x64': 'darwin-x64/mihomo',
      'darwin-arm64': 'darwin-arm64/mihomo',
      'linux-x64': 'linux-x64/mihomo',
      'linux-arm64': 'linux-arm64/mihomo'
    };

    const relPath = map[`${platform}-${arch}`];
    if (!relPath) {
      throw new Error(`Unsupported platform: ${platform}-${arch}`);
    }

    const candidates = [
      path.join(baseDir, relPath),
      // electron-builder 的 extraResources 会把根目录 assets 放在 resources/app/assets。
      path.join(process.resourcesPath, 'app', 'assets', 'mihomo', path.basename(relPath)),
      path.join(app.getAppPath(), 'assets', 'mihomo', path.basename(relPath)),
    ];
    const fullPath = candidates.find(candidate => fs.existsSync(candidate));
    if (!fullPath) {
      throw new Error(`Mihomo core not found. Checked: ${candidates.join(', ')}`);
    }

    // 如果是打包环境，复制到用户数据目录并赋予执行权限
    if (app.isPackaged) {
      const tempPath = path.join(app.getPath('userData'), 'core', relPath);
      const tempDir = path.dirname(tempPath);

      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      if (!fs.existsSync(tempPath) || fs.statSync(tempPath).size !== fs.statSync(fullPath).size) {
        fs.copyFileSync(fullPath, tempPath);
        if (platform !== 'win32') {
          fs.chmodSync(tempPath, 0o755);
        }
      }

      return tempPath;
    }

    // 开发环境直接使用
    if (platform !== 'win32') {
      try {
        fs.chmodSync(fullPath, 0o755);
      } catch (e) {
        // 忽略权限错误
      }
    }

    return fullPath;
  }

  /**
   * 确保配置目录存在
   */
  private ensureDirectories(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }

  /**
   * 获取或生成 API 密钥
   */
  private getOrCreateSecret(): string {
    const file = path.join(this.configDir, 'secret.txt');
    
    // ✅ 双重保险：确保目录存在
    this.ensureDirectories();
    
    if (fs.existsSync(file)) {
      return fs.readFileSync(file, 'utf-8').trim();
    }
    const crypto = require('crypto');
    const secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(file, secret);
    return secret;
  }

  /**
   * 启动 mihomo 进程
   */
  async start(nodes: Array<{ id: number; name: string; config: ParsedNode; localPort: number }>): Promise<void> {
    // 如果已经在启动中，等待完成
    if (this.startPromise) {
      await this.startPromise;
      return;
    }

    // 如果已经运行且就绪，必须热重载配置。直接返回会导致运行中导入的
    // 新节点没有监听端口，浏览器随后退回直连。
    if (this.process && !this.process.killed && this.ready) {
      await this.reloadConfig(nodes);
      return;
    }

    this.startPromise = this._doStart(nodes);
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async _doStart(nodes: Array<{ id: number; name: string; config: ParsedNode; localPort: number }>): Promise<void> {
    // ✅ 确保目录存在
    this.ensureDirectories();

    // Clash Verge 等软件也可能占用 9090。每次启动前选择一个可用的控制端口，
    // 避免核心实际启动失败而 UI 只看到下游 502。
    this.apiPort = await this.findAvailablePort(this.apiPort);
    this.apiBase = `http://127.0.0.1:${this.apiPort}`;

    // 生成配置文件
    const configPath = path.join(this.configDir, 'config.yaml');
    const config = ConfigGenerator.generate(nodes, this.apiSecret, this.apiPort);
    fs.writeFileSync(configPath, config);

    // 如果进程已存在但未就绪，先杀掉
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 500));
    }

    // 启动进程
    this.process = spawn(this.binaryPath, ['-d', this.configDir], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // 日志监听
    this.process.stdout?.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) {
        console.log('[Mihomo]', msg);
      }
    });

    this.process.stderr?.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) {
        console.error('[Mihomo ERR]', msg);
      }
    });

    this.process.on('exit', (code) => {
      this.ready = false;
      console.log(`[Mihomo] Process exited with code ${code}`);
    });

    this.process.on('error', (err) => {
      console.error('[Mihomo] Process error:', err);
      this.ready = false;
    });

    // 等待 API 就绪
    await this.waitForReady();

    this.ready = true;
    console.log('[Mihomo] Started successfully');
  }

  /**
   * 等待 mihomo API 就绪
   */
  private async waitForReady(timeout = 30000): Promise<void> {
    const start = Date.now();
    let lastError: Error | null = null;

    while (Date.now() - start < timeout) {
      try {
        const response = await axios.get(`${this.apiBase}/version`, {
          headers: { 'Authorization': `Bearer ${this.apiSecret}` },
          timeout: 2000
        });
        if (response.status === 200) {
          return;
        }
      } catch (e) {
        lastError = e as Error;
        await new Promise(r => setTimeout(r, 500));
      }
    }

    throw new Error(`Mihomo API not ready after ${timeout}ms: ${lastError?.message || 'unknown error'}`);
  }

  /**
   * 热重载配置
   */
  async reloadConfig(nodes: Array<{ id: number; name: string; config: ParsedNode; localPort: number }>): Promise<void> {
    if (!this.ready) {
      await this.start(nodes);
      return;
    }

    // ✅ 确保目录存在
    this.ensureDirectories();

    const configPath = path.join(this.configDir, 'config.yaml');
    const config = ConfigGenerator.generate(nodes, this.apiSecret, this.apiPort);
    fs.writeFileSync(configPath, config);

    try {
      await axios.put(
        `${this.apiBase}/configs?force=true`,
        { path: configPath },
        {
          headers: { 'Authorization': `Bearer ${this.apiSecret}` },
          timeout: 10000
        }
      );
      console.log('[Mihomo] Config reloaded successfully');
    } catch (e) {
      console.error('[Mihomo] Hot reload failed, restarting...', e);
      await this.restart(nodes);
    }
  }

  /**
   * 重启 mihomo
   */
  async restart(nodes: Array<{ id: number; name: string; config: ParsedNode; localPort: number }>): Promise<void> {
    await this.stop();
    await this.start(nodes);
  }

  /**
   * 停止 mihomo
   */
  async stop(): Promise<void> {
    // 尝试优雅关闭
    if (this.ready) {
      try {
        await axios.put(
          `${this.apiBase}/shutdown`,
          {},
          {
            headers: { 'Authorization': `Bearer ${this.apiSecret}` },
            timeout: 5000
          }
        );
      } catch (e) {
        // 忽略关闭请求失败
      }
    }

    // 强制杀掉进程
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
      // 等待进程退出
      await new Promise<void>((resolve) => {
        if (!this.process) return resolve();
        const check = setInterval(() => {
          if (this.process?.killed) {
            clearInterval(check);
            resolve();
          }
        }, 100);
        setTimeout(() => {
          clearInterval(check);
          if (this.process && !this.process.killed) {
            this.process.kill('SIGKILL');
          }
          resolve();
        }, 3000);
      });
    }

    this.process = null;
    this.ready = false;
    console.log('[Mihomo] Stopped');
  }

  /**
   * 测试节点延迟
   */
  async testDelay(nodeName: string): Promise<number> {
    if (!this.ready) {
      throw new Error('Mihomo is not ready');
    }

    try {
      const response = await axios.get(
        `${this.apiBase}/proxies/${encodeURIComponent(nodeName)}/delay`,
        {
          params: {
            // gstatic 在部分网络环境会被阻断，不能用它作为节点存活判定。
            // ipify 返回真实出口 IP，更能代表浏览器实际可用性。
            url: 'https://api.ipify.org?format=json',
            timeout: 10000
          },
          headers: { 'Authorization': `Bearer ${this.apiSecret}` },
          timeout: 12000
        }
      );
      return response.data.delay || -1;
    } catch (e) {
      return -1;
    }
  }

  private async findAvailablePort(preferred: number): Promise<number> {
    const candidates = [preferred, 19090, 19091, 19092, 19093, 19094];
    for (const port of candidates) {
      const free = await new Promise<boolean>(resolve => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
      });
      if (free) return port;
    }
    throw new Error('No free Mihomo API port available');
  }

  /**
   * 获取所有代理列表
   */
  async getAllProxies(): Promise<string[]> {
    if (!this.ready) {
      return [];
    }

    try {
      const response = await axios.get(`${this.apiBase}/proxies`, {
        headers: { 'Authorization': `Bearer ${this.apiSecret}` },
        timeout: 5000
      });
      return Object.keys(response.data.proxies || {});
    } catch (e) {
      return [];
    }
  }

  /**
   * 检查 mihomo 是否就绪
   */
  isReady(): boolean {
    return this.ready && this.process !== null && !this.process.killed;
  }

  /**
   * 获取进程 PID
   */
  getPid(): number | undefined {
    return this.process?.pid;
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    this.stop().catch(console.error);
  }
}
