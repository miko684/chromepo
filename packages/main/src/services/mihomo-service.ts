import { ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { MihomoManager } from '../core/mihomo-manager';
import { URIParser, type ParsedNode } from '../core/uri-parser';
import { PortAllocator } from '../core/port-allocator';
import { ConnectionTracker } from '../core/connection-tracker';
import { HealthChecker } from '../core/health-checker';
import { ConfigSnapshotManager } from '../core/config-snapshot';
import { ProxyDB } from '../db/proxy';
import { createLogger } from '../../../shared/utils/logger';

const logger = createLogger('MihomoService');

// 单例实例
const mihomo = new MihomoManager();
const parser = new URIParser();
const portAlloc = new PortAllocator();
const connectionTracker = new ConnectionTracker();
const healthChecker = new HealthChecker(mihomo);
const snapshotManager = new ConfigSnapshotManager();

// 缓存节点列表
let cachedNodes: Array<{ id: number; name: string; config: ParsedNode; localPort: number }> = [];

async function importOneNode(uri: string) {
  const trimmedUri = uri.trim();
  const parsed = parser.parse(trimmedUri);
  const existing = await ProxyDB.getByProxy(parsed.type, `${parsed.server}:${parsed.port}`);
  if (existing) throw new Error(`Node already exists: ${existing.proxy}`);

  const name = parsed.name || `${parsed.server}:${parsed.port}`;
  const [rawId] = await ProxyDB.create({
    proxy: `${parsed.server}:${parsed.port}`,
    proxy_type: parsed.type,
    remark: name,
    node_config: JSON.stringify(parsed),
    status: 'inactive'
  });
  const id = Number(rawId);
  const localPort = await portAlloc.allocate(id);
  await ProxyDB.update(id, { local_port: localPort });
  await reloadAllNodes();
  return { success: true, id, localPort, node: parsed, name };
}

/**
 * 初始化 Mihomo 服务
 */
export function initMihomoService(): void {
  logger.info('Initializing Mihomo service...');

  // 从数据库恢复端口分配状态
  restorePortAllocations();

  // 初始化时加载节点并启动
  reloadAllNodes()
    .then(() => healthChecker.checkAllNodes())
    .catch((e) => {
      logger.error('Failed to start Mihomo on init:', e);
    });

  // 启动健康检查（每 60 秒）
  healthChecker.start(60000);

  // ====== IPC 处理器 ======

  /**
   * 导入单个节点（支持 vless:// vmess:// 等）
   */
  ipcMain.handle('mihomo-import-node', async (_, uri: string) => {
    try {
      const result = await importOneNode(uri);
      logger.info(`Node imported: ${result.name} (ID: ${result.id}, Port: ${result.localPort})`);
      return result;
    } catch (e) {
      const error = e as Error;
      logger.error('Import node failed:', error.message);
      throw new Error(`Import failed: ${error.message}`);
    }
  });

  /**
   * 批量导入节点
   */
  ipcMain.handle('mihomo-import-nodes', async (_, uris: string[]) => {
    const results: Array<{ success: boolean; id?: number; localPort?: number; name?: string; error?: string; uri?: string }> = [];

    for (const uri of uris) {
      try {
        const trimmed = uri.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }
        results.push(await importOneNode(trimmed));
      } catch (e) {
        results.push({
          success: false,
          error: (e as Error).message,
          uri: uri.substring(0, 50)
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    logger.info(`Batch import: ${successCount}/${results.length} nodes imported`);

    return results;
  });

  /**
   * 删除节点
   */
  ipcMain.handle('mihomo-delete-node', async (_, id: number) => {
    // 检查是否被窗口使用
    if (connectionTracker.isNodeUsed(id)) {
      const windows = connectionTracker.getWindowsUsingNode(id);
      throw new Error(`Node ${id} is being used by ${windows.length} windows: ${windows.join(', ')}`);
    }

    const proxy = await ProxyDB.getById(id);
    if (!proxy) {
      throw new Error(`Node ${id} not found`);
    }

    // 从数据库删除
    await ProxyDB.remove(id);

    // 释放端口
    portAlloc.release(id);

    // 重载配置
    await reloadAllNodes();

    logger.info(`Node deleted: ${proxy.remark || proxy.proxy} (ID: ${id})`);

    return { success: true };
  });

  /**
   * 批量删除节点
   */
  ipcMain.handle('mihomo-delete-nodes', async (_, ids: number[]) => {
    const results: Array<{ id: number; success: boolean; error?: string }> = [];

    for (const id of ids) {
      try {
        const proxy = await ProxyDB.getById(Number(id));
        if (!proxy) throw new Error(`Node ${id} not found`);
        if (connectionTracker.isNodeUsed(Number(id))) throw new Error(`Node ${id} is in use`);
        await ProxyDB.remove(Number(id));
        portAlloc.release(Number(id));
        await reloadAllNodes();
        results.push({ id, success: true });
      } catch (e) {
        results.push({ id, success: false, error: (e as Error).message });
      }
    }

    return results;
  });

  /**
   * 测试节点延迟
   */
  ipcMain.handle('mihomo-test-delay', async (_, id: number) => {
    if (!mihomo.isReady()) {
      throw new Error('Mihomo is not ready');
    }

    const proxy = await ProxyDB.getById(id);
    if (!proxy) {
      throw new Error(`Node ${id} not found`);
    }

    const nodeName = `node-${id}`;
    const latency = await mihomo.testDelay(nodeName);
    const alive = latency > 0;

    await ProxyDB.updateStatus(id, alive ? 'active' : 'inactive', alive ? latency : null);

    return { id, latency, alive };
  });

  /**
   * 获取所有节点状态
   */
  ipcMain.handle('mihomo-get-status', async () => {
    if (!mihomo.isReady()) {
      return { ready: false, nodes: [] };
    }

    const proxies = await ProxyDB.all();
    const statuses: Array<{
      id: number;
      name: string;
      type: string;
      localPort: number | null;
      status: string;
      latency: number | null;
      lastCheck: string | null;
      usageCount: number;
    }> = [];

    for (const proxy of proxies) {
      if (proxy.id) {
        const id = Number(proxy.id);
        statuses.push({
          id,
          name: String(proxy.remark || proxy.proxy || `node-${id}`),
          type: String(proxy.proxy_type || 'unknown'),
          localPort: proxy.local_port ? Number(proxy.local_port) : null,
          status: String(proxy.status || 'unknown'),
          latency: proxy.latency == null ? null : Number(proxy.latency),
          lastCheck: proxy.last_check == null ? null : String(proxy.last_check),
          usageCount: connectionTracker.getNodeUsageCount(id)
        });
      }
    }

    return {
      ready: mihomo.isReady(),
      pid: mihomo.getPid(),
      nodes: statuses,
      totalWindows: connectionTracker.getTotalWindows()
    };
  });

  /**
   * 获取 mihomo 就绪状态
   */
  ipcMain.handle('mihomo-status', () => {
    return {
      ready: mihomo.isReady(),
      pid: mihomo.getPid(),
      totalNodes: cachedNodes.length,
      totalWindows: connectionTracker.getTotalWindows()
    };
  });

  /**
   * 启动 mihomo
   */
  ipcMain.handle('mihomo-start', async () => {
    await reloadAllNodes();
    return { success: true };
  });

  /**
   * 停止 mihomo
   */
  ipcMain.handle('mihomo-stop', async () => {
    await mihomo.stop();
    return { success: true };
  });

  /**
   * 重启 mihomo
   */
  ipcMain.handle('mihomo-restart', async () => {
    await reloadAllNodes();
    return { success: true };
  });

  /**
   * 窗口启动时记录绑定
   */
  ipcMain.handle('mihomo-bind-window', async (_, windowId: number, proxyId: number, label?: string) => {
    const proxy = await ProxyDB.getById(proxyId);
    if (!proxy) {
      throw new Error(`Node ${proxyId} not found`);
    }

    if (!proxy.local_port) {
      throw new Error(`Node ${proxyId} has no local port allocated`);
    }

    connectionTracker.onWindowStart(windowId, proxyId, proxy.local_port, label);

    // 更新窗口的 local_proxy_port 字段
    // 这里需要在 window service 中处理

    return {
      success: true,
      localPort: proxy.local_port,
      proxyId,
      windowId
    };
  });

  /**
   * 窗口关闭时释放绑定
   */
  ipcMain.handle('mihomo-unbind-window', async (_, windowId: number) => {
    connectionTracker.onWindowClose(windowId);
    return { success: true };
  });

  /**
   * 获取窗口绑定的节点信息
   */
  ipcMain.handle('mihomo-get-window-node', async (_, windowId: number) => {
    const binding = connectionTracker.getNodeForWindow(windowId);
    if (!binding) {
      return null;
    }

    const proxy = await ProxyDB.getById(binding.proxyId);
    return {
      proxyId: binding.proxyId,
      port: binding.port,
      name: proxy?.remark || proxy?.proxy || `node-${binding.proxyId}`,
      type: proxy?.proxy_type
    };
  });

  /**
   * 获取所有绑定关系
   */
  ipcMain.handle('mihomo-get-bindings', () => {
    return connectionTracker.getAllBindings();
  });

  /**
   * 创建配置快照
   */
  ipcMain.handle('mihomo-snapshot-create', async (_, description?: string) => {
    const configContent = await getCurrentConfigContent();
    return snapshotManager.takeSnapshot(configContent, cachedNodes.length, description);
  });

  /**
   * 列出所有快照
   */
  ipcMain.handle('mihomo-snapshot-list', () => {
    return snapshotManager.listSnapshots();
  });

  /**
   * 回滚到指定快照
   */
  ipcMain.handle('mihomo-snapshot-rollback', async (_, snapshotId: string) => {
    const result = snapshotManager.rollbackTo(snapshotId);
    if (!result.success || !result.content) {
      throw new Error(result.error || 'Rollback failed');
    }

    // 解析快照内容中的节点
    // 注意：这里需要重新解析 YAML 并更新数据库
    // 简化实现：直接重启 mihomo，用快照配置覆盖
    await mihomo.stop();

    // 这里应该从快照内容中提取节点并恢复数据库
    // 由于 YAML 解析较复杂，这里仅作示意
    // 实际实现需要 yaml 解析库

    return { success: true };
  });

  /**
   * 删除快照
   */
  ipcMain.handle('mihomo-snapshot-delete', (_, snapshotId: string) => {
    return snapshotManager.deleteSnapshot(snapshotId);
  });

  /**
   * 手动触发健康检查
   */
  ipcMain.handle('mihomo-health-check', async () => {
    await healthChecker.checkAllNodes();
    return { success: true };
  });

  logger.info('Mihomo service initialized');
}

/**
 * 从数据库恢复端口分配状态
 */
async function restorePortAllocations(): Promise<void> {
  try {
    const proxies = await ProxyDB.all();
    const allocations = proxies
      .filter(p => p.id && p.local_port)
      .map(p => ({ id: Number(p.id), local_port: Number(p.local_port) }));
    portAlloc.restoreFromDB(allocations);
    logger.info(`Restored ${allocations.length} port allocations`);
  } catch (e) {
    logger.error('Failed to restore port allocations:', e);
  }
}

/**
 * 重载所有节点配置
 */
async function reloadAllNodes(): Promise<void> {
  try {
    // node_config marks a Mihomo-managed node. Older import paths could create
    // the database row before allocating a local port, so repair that state
    // instead of silently launching Chromium without a proxy.
    const proxies = await ProxyDB.all();
    const nodes: Array<{ id: number; name: string; config: ParsedNode; localPort: number }> = [];
    for (const proxy of proxies) {
      if (!proxy.id || !proxy.node_config) continue;
      let localPort = proxy.local_port ? Number(proxy.local_port) : 0;
      if (!localPort) {
        localPort = await portAlloc.allocate(Number(proxy.id));
        await ProxyDB.update(Number(proxy.id), {
          local_port: localPort,
          status: (typeof proxy.status === 'string' ? proxy.status : 'inactive') as 'active' | 'inactive' | 'error',
        });
        logger.info(`Allocated missing Mihomo port ${localPort} for node ${proxy.id}`);
      }
      try {
        nodes.push({
          id: Number(proxy.id),
          name: String(proxy.remark || proxy.proxy || `node-${proxy.id}`),
          config: JSON.parse(String(proxy.node_config)) as ParsedNode,
          localPort,
        });
      } catch (error) {
        logger.error(`Invalid Mihomo node config for ${proxy.id}:`, error);
      }
    }

    cachedNodes = nodes;

    if (nodes.length === 0) {
      await mihomo.stop();
      logger.info('No active nodes, mihomo stopped');
      return;
    }

    await mihomo.start(nodes);
    logger.info(`Mihomo reloaded with ${nodes.length} nodes`);
  } catch (e) {
    logger.error('Failed to reload nodes:', e);
    throw e;
  }
}

/**
 * 获取当前配置内容
 */
async function getCurrentConfigContent(): Promise<string> {
  // 从 mihomo 配置目录读取
  const configDir = (mihomo as any).configDir;
  const configPath = path.join(configDir, 'config.yaml');
  if (fs.existsSync(configPath)) {
    return fs.readFileSync(configPath, 'utf-8');
  }
  return '';
}
