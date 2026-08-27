import fs from 'fs';
import path from 'path';
import { app } from 'electron';

/**
 * 配置快照管理器
 * 用于配置版本管理和回滚
 */
export interface ConfigSnapshot {
  id: string;
  filename: string;
  timestamp: string;
  nodeCount: number;
  description?: string;
}

export class ConfigSnapshotManager {
  private snapshotsDir: string;
  private maxSnapshots = 20;

  constructor() {
    this.snapshotsDir = path.join(app.getPath('userData'), 'mihomo-snapshots');
    this.ensureDirectory();
  }

  /**
   * 确保快照目录存在
   */
  private ensureDirectory(): void {
    if (!fs.existsSync(this.snapshotsDir)) {
      fs.mkdirSync(this.snapshotsDir, { recursive: true });
    }
  }

  /**
   * 创建配置快照
   */
  takeSnapshot(configContent: string, nodeCount: number, description?: string): ConfigSnapshot {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const id = `snapshot-${timestamp}`;
    const filename = `${id}.yaml`;
    const filePath = path.join(this.snapshotsDir, filename);

    // 写入快照文件
    fs.writeFileSync(filePath, configContent);

    // 保存元数据
    const metaPath = path.join(this.snapshotsDir, `${id}.meta.json`);
    const meta = {
      id,
      filename,
      timestamp: new Date().toISOString(),
      nodeCount,
      description: description || `Snapshot with ${nodeCount} nodes`
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

    // 清理旧快照
    this.cleanupOldSnapshots();

    return meta;
  }

  /**
   * 列出所有快照
   */
  listSnapshots(): ConfigSnapshot[] {
    const files = fs.readdirSync(this.snapshotsDir)
      .filter(f => f.endsWith('.meta.json'))
      .sort((a, b) => {
        const aTime = fs.statSync(path.join(this.snapshotsDir, a)).mtime.getTime();
        const bTime = fs.statSync(path.join(this.snapshotsDir, b)).mtime.getTime();
        return bTime - aTime;
      });

    const snapshots: ConfigSnapshot[] = [];
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(this.snapshotsDir, file), 'utf-8');
        const meta = JSON.parse(content);
        snapshots.push(meta);
      } catch (e) {
        console.error('[ConfigSnapshot] Failed to read meta file:', file, e);
      }
    }

    return snapshots;
  }

  /**
   * 获取快照内容
   */
  getSnapshotContent(snapshotId: string): string | null {
    const filename = `${snapshotId}.yaml`;
    const filePath = path.join(this.snapshotsDir, filename);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
    return null;
  }

  /**
   * 获取快照元数据
   */
  getSnapshotMeta(snapshotId: string): ConfigSnapshot | null {
    const metaPath = path.join(this.snapshotsDir, `${snapshotId}.meta.json`);
    if (fs.existsSync(metaPath)) {
      try {
        return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  /**
   * 回滚到指定快照
   */
  rollbackTo(snapshotId: string): { success: boolean; content: string | null; error?: string } {
    const content = this.getSnapshotContent(snapshotId);
    if (content === null) {
      return { success: false, content: null, error: `Snapshot ${snapshotId} not found` };
    }

    return { success: true, content };
  }

  /**
   * 删除快照
   */
  deleteSnapshot(snapshotId: string): boolean {
    const yamlPath = path.join(this.snapshotsDir, `${snapshotId}.yaml`);
    const metaPath = path.join(this.snapshotsDir, `${snapshotId}.meta.json`);

    let deleted = false;
    if (fs.existsSync(yamlPath)) {
      fs.unlinkSync(yamlPath);
      deleted = true;
    }
    if (fs.existsSync(metaPath)) {
      fs.unlinkSync(metaPath);
      deleted = true;
    }

    return deleted;
  }

  /**
   * 清理旧快照（保留最新的 maxSnapshots 个）
   */
  private cleanupOldSnapshots(): void {
    const snapshots = this.listSnapshots();
    if (snapshots.length <= this.maxSnapshots) {
      return;
    }

    // 删除最旧的快照（已按时间排序，从后往前删除）
    for (let i = this.maxSnapshots; i < snapshots.length; i++) {
      const snapshot = snapshots[i];
      this.deleteSnapshot(snapshot.id);
      console.log(`[ConfigSnapshot] Cleaned up old snapshot: ${snapshot.id}`);
    }
  }

  /**
   * 设置最大快照数量
   */
  setMaxSnapshots(count: number): void {
    this.maxSnapshots = Math.max(1, count);
    this.cleanupOldSnapshots();
  }

  /**
   * 获取快照统计信息
   */
  getStats(): { total: number; diskUsage: number } {
    const snapshots = this.listSnapshots();
    let totalSize = 0;
    for (const snapshot of snapshots) {
      const yamlPath = path.join(this.snapshotsDir, `${snapshot.id}.yaml`);
      if (fs.existsSync(yamlPath)) {
        totalSize += fs.statSync(yamlPath).size;
      }
    }
    return {
      total: snapshots.length,
      diskUsage: totalSize
    };
  }

  /**
   * 清空所有快照
   */
  clearAll(): void {
    const snapshots = this.listSnapshots();
    for (const snapshot of snapshots) {
      this.deleteSnapshot(snapshot.id);
    }
    console.log('[ConfigSnapshot] Cleared all snapshots');
  }
}