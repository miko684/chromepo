import { initCommonService } from './common-service';
import { initGroupService } from './group-service';
import { initProxyService } from './proxy-service';
import { initSyncService } from './sync-service';
import { initTagService } from './tag-service';
import { initWindowService } from './window-service';
import { initExtensionService } from './extension-service';
import { initMultiWindowSyncService } from './multi-window-sync-service';
import { initMihomoService } from './mihomo-service';
import { runMigrations } from '../db/migration';

export async function initServices() {
  // 先运行数据库迁移（添加 mihomo 所需字段）
  try {
    await runMigrations();
    console.log('[Services] Database migrations completed');
  } catch (e) {
    console.error('[Services] Migration failed:', e);
  }

  // 初始化所有服务
  initCommonService();
  initWindowService();
  initGroupService();
  initProxyService();
  initTagService();
  initSyncService();
  initExtensionService();
  initMultiWindowSyncService();

  // 🆕 初始化 Mihomo 服务（在 ProxyService 之后）
  try {
    initMihomoService();
    console.log('[Services] Mihomo service initialized');
  } catch (e) {
    console.error('[Services] Mihomo service initialization failed:', e);
  }

  console.log('[Services] All services initialized');
}