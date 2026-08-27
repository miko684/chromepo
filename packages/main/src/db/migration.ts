import { db } from '.';
import { createLogger } from '../../../shared/utils/logger';

const logger = createLogger('Migration');

/**
 * 运行数据库迁移
 * 添加 mihomo 所需的字段
 */
export async function runMigrations(): Promise<void> {
  logger.info('Running database migrations...');

  try {
    // 检查 proxy 表是否存在
    const tables = await db.raw("SELECT name FROM sqlite_master WHERE type='table' AND name='proxy'");
    if (tables.length === 0) {
      logger.warn('Proxy table not found, skipping migrations');
      return;
    }

    // 获取 proxy 表的列信息
    const columns = await db.raw('PRAGMA table_info(proxy)');
    const columnNames = columns.map((col: any) => col.name);

    // 添加 node_config 字段
    if (!columnNames.includes('node_config')) {
      await db.schema.table('proxy', (table) => {
        table.text('node_config');
      });
      logger.info('Added column: node_config to proxy table');
    }

    // 添加 local_port 字段
    if (!columnNames.includes('local_port')) {
      await db.schema.table('proxy', (table) => {
        table.integer('local_port');
      });
      logger.info('Added column: local_port to proxy table');
    }

    // 添加 latency 字段
    if (!columnNames.includes('latency')) {
      await db.schema.table('proxy', (table) => {
        table.integer('latency');
      });
      logger.info('Added column: latency to proxy table');
    }

    // 添加 status 字段
    if (!columnNames.includes('status')) {
      await db.schema.table('proxy', (table) => {
        table.text('status').defaultTo('inactive');
      });
      logger.info('Added column: status to proxy table');
    }

    // 添加 last_check 字段
    if (!columnNames.includes('last_check')) {
      await db.schema.table('proxy', (table) => {
        table.text('last_check');
      });
      logger.info('Added column: last_check to proxy table');
    }

    // 检查 window 表的列
    const windowColumns = await db.raw('PRAGMA table_info(window)');
    const windowColumnNames = windowColumns.map((col: any) => col.name);

    // 添加 local_proxy_port 字段到 window 表
    if (!windowColumnNames.includes('local_proxy_port')) {
      await db.schema.table('window', (table) => {
        table.integer('local_proxy_port');
      });
      logger.info('Added column: local_proxy_port to window table');
    }

    logger.info('Database migrations completed successfully');
  } catch (e) {
    logger.error('Migration failed:', e);
    throw e;
  }
}