import { MihomoManager } from './mihomo-manager';
import { ProxyDB } from '../db/proxy';

/**
 * 节点健康检查器
 * 定期测试所有节点的延迟和可用性
 */
export class HealthChecker {
  private mihomoManager: MihomoManager;
  private intervalId: NodeJS.Timeout | null = null;
  private checkInterval = 60000; // 默认 60 秒
  private isRunning = false;
  private timeout = 5000;

  constructor(mihomoManager: MihomoManager) {
    this.mihomoManager = mihomoManager;
  }

  /**
   * 启动定期检查
   */
  start(intervalMs?: number): void {
    if (this.isRunning) {
      return;
    }

    if (intervalMs) {
      this.checkInterval = intervalMs;
    }

    this.isRunning = true;
    this.checkAllNodes(); // 立即执行一次

    this.intervalId = setInterval(() => {
      this.checkAllNodes();
    }, this.checkInterval);

    console.log(`[HealthChecker] Started with interval ${this.checkInterval}ms`);
  }

  /**
   * 停止定期检查
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[HealthChecker] Stopped');
  }

  /**
   * 检查所有节点
   */
  async checkAllNodes(): Promise<void> {
    if (!this.mihomoManager.isReady()) {
      console.log('[HealthChecker] Mihomo not ready, skipping check');
      return;
    }

    try {
      const proxies = await ProxyDB.getActiveNodes();
      const results: Array<{ id: number; latency: number; alive: boolean }> = [];

      for (const proxy of proxies) {
        if (!proxy.id) continue;

        const nodeName = `node-${proxy.id}`;
        const latency = await this.mihomoManager.testDelay(nodeName);
        const alive = latency > 0;

        // 更新数据库
        await ProxyDB.updateStatus(proxy.id, alive ? 'active' : 'inactive', alive ? latency : null);

        results.push({ id: proxy.id, latency, alive });
      }

      const aliveCount = results.filter(r => r.alive).length;
      console.log(`[HealthChecker] Checked ${results.length} nodes, ${aliveCount} alive`);
    } catch (e) {
      console.error('[HealthChecker] Check failed:', e);
    }
  }

  /**
   * 检查单个节点
   */
  async checkNode(proxyId: number): Promise<{ latency: number; alive: boolean }> {
    if (!this.mihomoManager.isReady()) {
      throw new Error('Mihomo is not ready');
    }

    const proxy = await ProxyDB.getById(proxyId);
    if (!proxy) {
      throw new Error(`Node ${proxyId} not found`);
    }

    const nodeName = `node-${proxyId}`;
    const latency = await this.mihomoManager.testDelay(nodeName);
    const alive = latency > 0;

    await ProxyDB.updateStatus(proxyId, alive ? 'active' : 'inactive', alive ? latency : null);

    return { latency, alive };
  }

  /**
   * 检查多个节点
   */
  async checkNodes(proxyIds: number[]): Promise<Map<number, { latency: number; alive: boolean }>> {
    const results = new Map<number, { latency: number; alive: boolean }>();

    for (const id of proxyIds) {
      try {
        const result = await this.checkNode(id);
        results.set(id, result);
      } catch (e) {
        results.set(id, { latency: -1, alive: false });
      }
    }

    return results;
  }

  /**
   * 获取节点状态（从数据库读取缓存的检查结果）
   */
  async getNodeStatus(proxyId: number): Promise<{ status: string; latency: number | null; lastCheck: string | null }> {
    const proxy = await ProxyDB.getById(proxyId);
    if (!proxy) {
      throw new Error(`Node ${proxyId} not found`);
    }

    return {
      status: proxy.status || 'unknown',
      latency: proxy.latency || null,
      lastCheck: proxy.last_check || null
    };
  }

  /**
   * 获取所有节点状态
   */
  async getAllNodeStatuses(): Promise<Map<number, { status: string; latency: number | null; lastCheck: string | null }>> {
    const proxies = await ProxyDB.all();
    const results = new Map<number, { status: string; latency: number | null; lastCheck: string | null }>();

    for (const proxy of proxies) {
      if (proxy.id) {
        const id = Number(proxy.id);
        results.set(id, {
          status: String(proxy.status || 'unknown'),
          latency: proxy.latency == null ? null : Number(proxy.latency),
          lastCheck: proxy.last_check == null ? null : String(proxy.last_check)
        });
      }
    }

    return results;
  }

  /**
   * 设置检查超时时间
   */
  setTimeout(ms: number): void {
    this.timeout = ms;
  }

  /**
   * 获取当前配置
   */
  getConfig(): { interval: number; timeout: number; isRunning: boolean } {
    return {
      interval: this.checkInterval,
      timeout: this.timeout,
      isRunning: this.isRunning
    };
  }

  /**
   * 手动触发一次检查（不等待定时器）
   */
  async triggerCheck(): Promise<void> {
    await this.checkAllNodes();
  }
}
