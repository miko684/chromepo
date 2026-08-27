import { db } from '.';
import type { DB, SafeAny } from '../../../shared/types/db';

const all = async () => {
  return await db('proxy')
    .leftJoin('window', function () {
      this.on('window.proxy_id', '=', 'proxy.id').andOn('window.status', '>', 0 as SafeAny);
    })
    .select('proxy.*')
    .count('window.id as usageCount')
    .groupBy('proxy.id')
    .orderBy('proxy.created_at', 'desc');
};

const getById = async (id: number) => {
  return await db('proxy').where({ id }).first();
};

const getByProxy = async (proxy_type?: string, proxy?: string) => {
  return await db('proxy').where({ proxy_type, proxy }).first();
};

const update = async (id: number, updatedData: Partial<DB.Proxy>) => {
  // 清理 undefined 字段
  const cleanData: any = { ...updatedData };
  Object.keys(cleanData).forEach(key => {
    if (cleanData[key] === undefined) {
      delete cleanData[key];
    }
  });
  return await db('proxy').where({ id }).update(cleanData);
};

const create = async (proxyData: Omit<DB.Proxy, 'id'>) => {
  return await db('proxy').insert(proxyData);
};

const importProxies = async (proxies: Omit<DB.Proxy, 'id'>[]) => {
  return await db('proxy').insert(proxies);
};

const remove = async (id: number) => {
  return await db('proxy').where({ id }).delete();
};

const deleteAll = async () => {
  return await db('proxy').delete();
};

const batchDelete = async (ids: number[]) => {
  // 首先，检查这些 IDs 是否被 window 表所引用（状态大于 0 的窗口）
  const referencedIds = await db('window')
    .select('proxy_id')
    .where('status', '>', 0)
    .whereIn('proxy_id', ids)
    .then(rows => rows.map(row => row.proxy_id));

  if (referencedIds.length > 0) {
    return { success: false, message: 'Some IDs are referenced in the window table.', referencedIds };
  }

  try {
    await db('proxy').delete().whereIn('id', ids);
    return { success: true };
  } catch (error) {
    return { success: false, message: 'Failed to delete.' };
  }
};

// ========== 🆕 mihomo 新增方法 ==========

/**
 * 按本地端口查找代理
 */
const findByLocalPort = async (port: number) => {
  return await db('proxy').where({ local_port: port }).first();
};

/**
 * 更新节点状态（延迟/存活）
 */
const updateStatus = async (id: number, status: string, latency?: number | null) => {
  const updateData: any = {
    status,
    last_check: db.fn.now()
  };
  if (latency !== undefined) {
    updateData.latency = latency;
  }
  return await db('proxy').where({ id }).update(updateData);
};

/**
 * 获取所有可由 Mihomo 管理的节点。
 *
 * 节点的 status 是探测结果，不是启用开关。旧逻辑只取 active/null，
 * 导致一次网络抖动写入 error/inactive 后，应用重启永远不会再加载该节点。
 * 只要节点有本地端口和保存的配置，就应该在启动时恢复，再由健康检查更新状态。
 */
const getActiveNodes = async () => {
  return await db('proxy')
    .whereNotNull('local_port')
    .whereNotNull('node_config')
    .orderBy('created_at', 'asc');
};

/**
 * 获取有 local_port 的所有节点（包括非活跃的）
 */
const getAllWithPort = async () => {
  return await db('proxy')
    .whereNotNull('local_port')
    .orderBy('created_at', 'asc');
};

/**
 * 批量更新节点状态
 */
const batchUpdateStatus = async (statusMap: Map<number, { status: string; latency?: number }>) => {
  const promises: Promise<any>[] = [];
  for (const [id, data] of statusMap) {
    promises.push(updateStatus(id, data.status, data.latency));
  }
  await Promise.all(promises);
};

export const ProxyDB = {
  all,
  getById,
  getByProxy,
  batchDelete,
  importProxies,
  update,
  create,
  remove,
  deleteAll,
  // 🆕 新增导出
  findByLocalPort,
  updateStatus,
  getActiveNodes,
  getAllWithPort,
  batchUpdateStatus,
};
