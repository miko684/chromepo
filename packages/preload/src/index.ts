/**
 * @module preload
 * 
 * 🆕 修改：使用 contextBridge 暴露 API，而不是直接 export
 * 原因：contextIsolation: true 时，export 的内容不会自动出现在渲染进程的 window 上
 * 必须显式用 contextBridge.exposeInMainWorld 暴露
 */

import { contextBridge, ipcRenderer } from 'electron';

// ============================================================
// 原有的 Bridges（用 contextBridge 暴露）
// ============================================================

// ===== WindowBridge =====
const WindowBridge = {
  async import(file: string) {
    return await ipcRenderer.invoke('window-import', file);
  },
  async create(window: any, fingerprint: any) {
    return await ipcRenderer.invoke('window-create', window, fingerprint);
  },
  async update(id: number, window: any) {
    return await ipcRenderer.invoke('window-update', id, window);
  },
  async delete(id: number) {
    return await ipcRenderer.invoke('window-delete', id);
  },
  async batchClear(ids: number[]) {
    return await ipcRenderer.invoke('window-batchClear', ids);
  },
  async batchDelete(ids: number[]) {
    return await ipcRenderer.invoke('window-batchDelete', ids);
  },
  async getAll() {
    return await ipcRenderer.invoke('window-getAll');
  },
  async getOpenedWindows() {
    return await ipcRenderer.invoke('window-getOpened');
  },
  async getFingerprint(windowId?: number) {
    return await ipcRenderer.invoke('window-fingerprint', windowId);
  },
  async getById(id: number) {
    return await ipcRenderer.invoke('window-getById', id);
  },
  async open(id: number) {
    return await ipcRenderer.invoke('window-open', id);
  },
  async close(id: number) {
    return await ipcRenderer.invoke('window-close', id, true);
  },
  async toogleSetCookie(id: number) {
    return await ipcRenderer.invoke('window-set-cookie', id);
  },
  onWindowClosed: (callback: (event: any, id: number) => void) => {
    ipcRenderer.on('window-closed', callback);
    return () => ipcRenderer.off('window-closed', callback);
  },
  onWindowOpened: (callback: (event: any, id: number) => void) => {
    ipcRenderer.on('window-opened', callback);
    return () => ipcRenderer.off('window-opened', callback);
  },
  offWindowClosed: (callback: (event: any, id: number) => void) => {
    ipcRenderer.off('window-closed', callback);
  },
  offWindowOpened: (callback: (event: any, id: number) => void) => {
    ipcRenderer.off('window-opened', callback);
  },
};

// ===== GroupBridge =====
const GroupBridge = {
  async getAll() {
    return await ipcRenderer.invoke('group-getAll');
  },
  async create(group: any) {
    return await ipcRenderer.invoke('group-create', group);
  },
  async update(group: any) {
    return await ipcRenderer.invoke('group-update', group);
  },
  async delete(id: number) {
    return await ipcRenderer.invoke('group-delete', id);
  },
};

// ===== ProxyBridge =====
const ProxyBridge = {
  async getAll() {
    return await ipcRenderer.invoke('proxy-getAll');
  },
  async import(proxies: any[]) {
    return await ipcRenderer.invoke('proxy-import', proxies);
  },
  async update(id: number, proxy: any) {
    return await ipcRenderer.invoke('proxy-update', id, proxy);
  },
  async batchDelete(ids: number[]) {
    return await ipcRenderer.invoke('proxy-batchDelete', ids);
  },
  async checkProxy(params: number | any) {
    return await ipcRenderer.invoke('proxy-test', params);
  },
};

// ===== 🆕 MihomoBridge =====
const MihomoBridge = {
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

// ===== TagBridge =====
const TagBridge = {
  async getAll() {
    return await ipcRenderer.invoke('tag-getAll');
  },
  async create(tag: any) {
    return await ipcRenderer.invoke('tag-create', tag);
  },
  async update(tag: any) {
    return await ipcRenderer.invoke('tag-update', tag);
  },
  async delete(id: number) {
    return await ipcRenderer.invoke('tag-delete', id);
  },
};

// ===== CommonBridge =====
const CommonBridge = {
  async download(path: string) {
    return await ipcRenderer.invoke('common-download', path);
  },
  async choosePath(type: 'openFile' | 'openDirectory') {
    return await ipcRenderer.invoke('common-choose-path', type);
  },
  async share(key: string, value?: unknown) {
    return await ipcRenderer.invoke('data-share', key, value);
  },
  async saveDialog(options: Electron.SaveDialogOptions) {
    return await ipcRenderer.invoke('common-save-dialog', options);
  },
  async saveFile(filePath: string, buffer: Uint8Array | ArrayBuffer) {
    return await ipcRenderer.invoke('common-save-file', { filePath, buffer });
  },
  async getSettings() {
    return await ipcRenderer.invoke('common-fetch-settings');
  },
  async saveSettings(settings: any) {
    return await ipcRenderer.invoke('common-save-settings', settings);
  },
  async getLogs(logModule: any) {
    return await ipcRenderer.invoke('common-fetch-logs', logModule);
  },
  async getApi() {
    return await ipcRenderer.invoke('common-api');
  },
  onMessaged: (callback: (event: any, msg: any) => void) => {
    ipcRenderer.on('bridge-msg', callback);
    return () => ipcRenderer.off('bridge-msg', callback);
  },
  offMessaged: (callback: (event: any, msg: any) => void) => {
    ipcRenderer.off('bridge-msg', callback);
  },
};

// ===== SyncBridge =====
const SyncBridge = {
  arrangeWindows: (args: any) => ipcRenderer.invoke('window-arrange', args),
  getMonitors: () => ipcRenderer.invoke('window-get-monitors'),
  startSync: (args: any) => ipcRenderer.invoke('multi-window-sync-start', args),
  stopSync: () => ipcRenderer.invoke('multi-window-sync-stop'),
  getSyncStatus: () => ipcRenderer.invoke('multi-window-sync-status'),
  onShortcutStart: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('sync-shortcut-start', listener);
    return () => ipcRenderer.removeListener('sync-shortcut-start', listener);
  },
  onShortcutStop: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('sync-shortcut-stop', listener);
    return () => ipcRenderer.removeListener('sync-shortcut-stop', listener);
  },
};

// ===== ExtensionBridge =====
const ExtensionBridge = {
  import: (filePath: string) => ipcRenderer.invoke('extension-import', filePath),
  getAll: () => ipcRenderer.invoke('extension-get-all'),
  applyToWindows: (extensionId: number, windowIds: number[]) =>
    ipcRenderer.invoke('extension-apply-to-windows', extensionId, windowIds),
  deleteExtensionWindows: (extensionId: number, windowIds: number[]) =>
    ipcRenderer.invoke('delete-extension-windows', extensionId, windowIds),
  getExtensionWindows: (extensionId: number) =>
    ipcRenderer.invoke('extension-get-windows', extensionId),
  createExtension: (extension: any) => ipcRenderer.invoke('extension-create', extension),
  uploadPackage: (filePath: string, extensionId?: number) =>
    ipcRenderer.invoke('extension-upload-package', filePath, extensionId),
  updateExtension: (extensionId: number, extension: any) =>
    ipcRenderer.invoke('extension-update', extensionId, extension),
  deleteExtension: (extensionId: number) =>
    ipcRenderer.invoke('extension-delete', extensionId),
  syncWindowExtensions: (extensionId: number, windowIds: number[]) =>
    ipcRenderer.invoke('extension-sync-windows', extensionId, windowIds),
};

// ============================================================
// 🆕 通过 contextBridge 暴露所有 API 到渲染进程
// ============================================================

contextBridge.exposeInMainWorld('WindowBridge', WindowBridge);
contextBridge.exposeInMainWorld('GroupBridge', GroupBridge);
contextBridge.exposeInMainWorld('ProxyBridge', ProxyBridge);
contextBridge.exposeInMainWorld('MihomoBridge', MihomoBridge);
contextBridge.exposeInMainWorld('TagBridge', TagBridge);
contextBridge.exposeInMainWorld('CommonBridge', CommonBridge);
contextBridge.exposeInMainWorld('SyncBridge', SyncBridge);
contextBridge.exposeInMainWorld('ExtensionBridge', ExtensionBridge);

// 也暴露原有的功能（保持向后兼容）
contextBridge.exposeInMainWorld('sha256sum', (data: any) => {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(data).digest('hex');
});

contextBridge.exposeInMainWorld('versions', process.versions);

const customizeToolbarControl = {
  close: () => ipcRenderer.invoke('close'),
  minimize: () => ipcRenderer.invoke('minimize'),
  maximize: () => ipcRenderer.invoke('maximize'),
  isMaximized: async () => await ipcRenderer.invoke('isMaximized'),
};
contextBridge.exposeInMainWorld('customizeToolbarControl', customizeToolbarControl);

console.log('[Preload] All bridges exposed to renderer');

// 供 renderer 的类型/构建阶段复用；运行时仍以 contextBridge 暴露的对象为准。
// 没有这些导出时，Rollup 会在 pages/windows 等页面打包阶段报
// “WindowBridge is not exported by ../preload/src/index.ts”。
export {
  WindowBridge,
  GroupBridge,
  ProxyBridge,
  MihomoBridge,
  TagBridge,
  CommonBridge,
  SyncBridge,
  ExtensionBridge,
  customizeToolbarControl,
};
