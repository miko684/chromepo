import net from 'net';

/**
 * 端口分配器
 * 维护本地端口池，为每个代理节点分配唯一的本地端口
 */
export class PortAllocator {
  private basePort = 10000;
  private maxPort = 60000;
  private allocated: Map<number, number> = new Map(); // proxyId -> port
  private portInUse: Set<number> = new Set();

  /**
   * 为指定节点分配本地端口
   */
  async allocate(proxyId: number): Promise<number> {
    if (this.allocated.has(proxyId)) {
      return this.allocated.get(proxyId)!;
    }

    let port = this.basePort;
    let attempts = 0;
    const maxAttempts = this.maxPort - this.basePort;

    while (attempts < maxAttempts) {
      if (!this.portInUse.has(port) && !(await this.isPortOccupied(port))) {
        this.portInUse.add(port);
        this.allocated.set(proxyId, port);
        return port;
      }
      port++;
      attempts++;
    }

    throw new Error(`No available port in range ${this.basePort}-${this.maxPort}`);
  }

  /**
   * 检查端口是否被系统其他进程占用
   */
  private isPortOccupied(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          server.close();
          resolve(true);
        }
      }, 500);

      server.once('error', (err: any) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          // ECONNREFUSED 表示端口未被占用
          resolve(err.code !== 'ECONNREFUSED');
        }
      });

      server.once('listening', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          server.close();
          resolve(false);
        }
      });

      try {
        server.listen(port, '127.0.0.1');
      } catch (e) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(true);
        }
      }
    });
  }

  /**
   * 释放节点占用的端口
   */
  release(proxyId: number): void {
    if (this.allocated.has(proxyId)) {
      const port = this.allocated.get(proxyId)!;
      this.portInUse.delete(port);
      this.allocated.delete(proxyId);
    }
  }

  /**
   * 获取节点占用的端口
   */
  getPort(proxyId: number): number | undefined {
    return this.allocated.get(proxyId);
  }

  /**
   * 获取所有已分配的端口映射
   */
  getAllocated(): Map<number, number> {
    return new Map(this.allocated);
  }

  /**
   * 从数据库恢复分配状态（应用启动时调用）
   */
  restoreFromDB(allocations: Array<{ id: number; local_port: number }>): void {
    for (const { id, local_port } of allocations) {
      if (local_port && local_port >= this.basePort && local_port < this.maxPort) {
        this.allocated.set(id, local_port);
        this.portInUse.add(local_port);
      }
    }
  }

  /**
   * 检查端口是否已被分配
   */
  isAllocated(proxyId: number): boolean {
    return this.allocated.has(proxyId);
  }

  /**
   * 获取下一个可用端口（不分配，仅查询）
   */
  async findNextAvailable(startPort?: number): Promise<number> {
    let port = startPort || this.basePort;
    while (port < this.maxPort) {
      if (!this.portInUse.has(port) && !(await this.isPortOccupied(port))) {
        return port;
      }
      port++;
    }
    throw new Error(`No available port in range ${this.basePort}-${this.maxPort}`);
  }

  /**
   * 重置所有分配（谨慎使用）
   */
  reset(): void {
    this.allocated.clear();
    this.portInUse.clear();
  }

  /**
   * 获取当前已分配数量
   */
  getCount(): number {
    return this.allocated.size;
  }
}