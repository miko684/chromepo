/**
 * 连接追踪器
 * 追踪窗口与代理节点的绑定关系，用于热重载时的安全控制
 */
export class ConnectionTracker {
  // windowId -> { proxyId, port }
  private windowNodeMap: Map<number, { proxyId: number; port: number }> = new Map();
  // proxyId -> Set<windowId>
  private nodeUsage: Map<number, Set<number>> = new Map();
  // windowId -> 窗口标题或标识（用于调试）
  private windowLabels: Map<number, string> = new Map();

  /**
   * 窗口启动时记录绑定
   */
  onWindowStart(windowId: number, proxyId: number, port: number, label?: string): void {
    this.windowNodeMap.set(windowId, { proxyId, port });

    if (!this.nodeUsage.has(proxyId)) {
      this.nodeUsage.set(proxyId, new Set());
    }
    this.nodeUsage.get(proxyId)!.add(windowId);

    if (label) {
      this.windowLabels.set(windowId, label);
    }

    console.log(`[ConnectionTracker] Window ${windowId} bound to node ${proxyId} on port ${port}`);
  }

  /**
   * 窗口关闭时释放绑定
   */
  onWindowClose(windowId: number): void {
    const entry = this.windowNodeMap.get(windowId);
    if (entry) {
      const { proxyId } = entry;
      const usageSet = this.nodeUsage.get(proxyId);
      if (usageSet) {
        usageSet.delete(windowId);
        if (usageSet.size === 0) {
          this.nodeUsage.delete(proxyId);
        }
      }
      this.windowNodeMap.delete(windowId);
      this.windowLabels.delete(windowId);

      console.log(`[ConnectionTracker] Window ${windowId} unbound from node ${proxyId}`);
    }
  }

  /**
   * 检查节点是否被任何窗口使用
   */
  isNodeUsed(proxyId: number): boolean {
    const usageSet = this.nodeUsage.get(proxyId);
    return usageSet !== undefined && usageSet.size > 0;
  }

  /**
   * 获取使用指定节点的所有窗口 ID
   */
  getWindowsUsingNode(proxyId: number): number[] {
    const usageSet = this.nodeUsage.get(proxyId);
    return usageSet ? Array.from(usageSet) : [];
  }

  /**
   * 获取节点当前使用的窗口数量
   */
  getNodeUsageCount(proxyId: number): number {
    const usageSet = this.nodeUsage.get(proxyId);
    return usageSet ? usageSet.size : 0;
  }

  /**
   * 获取窗口绑定的节点信息
   */
  getNodeForWindow(windowId: number): { proxyId: number; port: number } | undefined {
    return this.windowNodeMap.get(windowId);
  }

  /**
   * 获取所有活跃的窗口-节点绑定关系
   */
  getAllBindings(): Array<{ windowId: number; proxyId: number; port: number; label?: string }> {
    const bindings: Array<{ windowId: number; proxyId: number; port: number; label?: string }> = [];
    for (const [windowId, { proxyId, port }] of this.windowNodeMap) {
      bindings.push({
        windowId,
        proxyId,
        port,
        label: this.windowLabels.get(windowId)
      });
    }
    return bindings;
  }

  /**
   * 获取所有正在使用的节点 ID 列表
   */
  getActiveNodeIds(): number[] {
    return Array.from(this.nodeUsage.keys());
  }

  /**
   * 获取所有正在使用的端口列表
   */
  getActivePorts(): number[] {
    const ports: number[] = [];
    for (const { port } of this.windowNodeMap.values()) {
      if (!ports.includes(port)) {
        ports.push(port);
      }
    }
    return ports;
  }

  /**
   * 检查窗口是否已绑定
   */
  isWindowBound(windowId: number): boolean {
    return this.windowNodeMap.has(windowId);
  }

  /**
   * 获取总窗口数
   */
  getTotalWindows(): number {
    return this.windowNodeMap.size;
  }

  /**
   * 获取总节点使用数（去重）
   */
  getTotalNodesInUse(): number {
    return this.nodeUsage.size;
  }

  /**
   * 重置所有追踪（谨慎使用）
   */
  reset(): void {
    this.windowNodeMap.clear();
    this.nodeUsage.clear();
    this.windowLabels.clear();
    console.log('[ConnectionTracker] Reset all tracking');
  }

  /**
   * 获取调试信息
   */
  getDebugInfo(): string {
    const lines: string[] = [];
    lines.push('=== ConnectionTracker Debug Info ===');
    lines.push(`Total windows: ${this.getTotalWindows()}`);
    lines.push(`Total nodes in use: ${this.getTotalNodesInUse()}`);
    lines.push('Bindings:');
    for (const [windowId, { proxyId, port }] of this.windowNodeMap) {
      const label = this.windowLabels.get(windowId) || 'unnamed';
      lines.push(`  Window ${windowId} (${label}) -> Node ${proxyId} on port ${port}`);
    }
    lines.push('Node usage:');
    for (const [proxyId, windows] of this.nodeUsage) {
      lines.push(`  Node ${proxyId}: ${windows.size} windows [${Array.from(windows).join(', ')}]`);
    }
    return lines.join('\n');
  }
}