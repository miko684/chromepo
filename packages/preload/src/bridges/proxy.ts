import { ipcRenderer } from 'electron';
import type { DB } from '../../../shared/types/db';

export const ProxyBridge = {
  async getAll() {
    const result = await ipcRenderer.invoke('proxy-getAll');
    return result;
  },

  async import(proxies: DB.Proxy[]) {
    const result = await ipcRenderer.invoke('proxy-import', proxies);
    return result;
  },

  async update(id: number, proxy: DB.Proxy) {
    const result = await ipcRenderer.invoke('proxy-update', id, proxy);
    return result;
  },

  async batchDelete(ids: number[]) {
    const result = await ipcRenderer.invoke('proxy-batchDelete', ids);
    return result;
  },

  async checkProxy(params: number | DB.Proxy) {
    const result = await ipcRenderer.invoke('proxy-test', params);
    return result;
  },
  // async checkTmpProxy(proxy: DB.Proxy) {
  //   const result = await ipcRenderer.invoke('proxy-test', proxy);
  //   return result;
  // },
};

// ===== 🆕 MihomoBridge =====
export const MihomoBridge = {
  // 导入单个节点
  importNode: (uri: string) => ipcRenderer.invoke('mihomo-import-node', uri),
  // 批量导入节点
  importNodes: (uris: string[]) => ipcRenderer.invoke('mihomo-import-nodes', uris),
  // 删除节点
  deleteNode: (id: number) => ipcRenderer.invoke('mihomo-delete-node', id),
  // 批量删除节点
  deleteNodes: (ids: number[]) => ipcRenderer.invoke('mihomo-delete-nodes', ids),
  // 测试节点延迟
  testDelay: (id: number) => ipcRenderer.invoke('mihomo-test-delay', id),
  // 获取所有节点状态
  getStatus: () => ipcRenderer.invoke('mihomo-get-status'),
  // 获取 mihomo 就绪状态
  getReadyStatus: () => ipcRenderer.invoke('mihomo-status'),
  // 启动 mihomo
  start: () => ipcRenderer.invoke('mihomo-start'),
  // 停止 mihomo
  stop: () => ipcRenderer.invoke('mihomo-stop'),
  // 重启 mihomo
  restart: () => ipcRenderer.invoke('mihomo-restart'),
  // 窗口绑定
  bindWindow: (windowId: number, proxyId: number, label?: string) =>
    ipcRenderer.invoke('mihomo-bind-window', windowId, proxyId, label),
  // 窗口解绑
  unbindWindow: (windowId: number) => ipcRenderer.invoke('mihomo-unbind-window', windowId),
  // 获取窗口绑定的节点
  getWindowNode: (windowId: number) => ipcRenderer.invoke('mihomo-get-window-node', windowId),
  // 获取所有绑定关系
  getBindings: () => ipcRenderer.invoke('mihomo-get-bindings'),
  // 创建配置快照
  createSnapshot: (description?: string) => ipcRenderer.invoke('mihomo-snapshot-create', description),
  // 列出所有快照
  listSnapshots: () => ipcRenderer.invoke('mihomo-snapshot-list'),
  // 回滚到指定快照
  rollbackSnapshot: (snapshotId: string) => ipcRenderer.invoke('mihomo-snapshot-rollback', snapshotId),
  // 删除快照
  deleteSnapshot: (snapshotId: string) => ipcRenderer.invoke('mihomo-snapshot-delete', snapshotId),
  // 手动触发健康检查
  healthCheck: () => ipcRenderer.invoke('mihomo-health-check'),
};