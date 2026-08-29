import {
  Alert,
  Button,
  Empty,
  Input,
  Space,
  Spin,
  Tag,
  Tooltip,
  message,
} from 'antd';
import {
  ApiOutlined,
  CheckCircleOutlined,
  DisconnectOutlined,
  GlobalOutlined,
  LinkOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {CommonBridge} from '#preload';
import type {
  BrowserInstanceSummary,
  BrowserTabSummary,
  XPageSnapshot,
} from '../../../../shared/types/control';
import './index.css';

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  message?: string;
}

const request = async <T,>(baseUrl: string, path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {'content-type': 'application/json', ...(init?.headers || {})},
  });
  const body = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || body.success === false) {
    throw new Error(body.message || `控制接口返回 HTTP ${response.status}`);
  }
  return body.data as T;
};

const statusLabel = (status: BrowserInstanceSummary['status']) => {
  if (status === 'running') return '运行中';
  if (status === 'closed') return '已关闭';
  return '不可用';
};

const ControlCenter = () => {
  const [apiUrl, setApiUrl] = useState('');
  const [instances, setInstances] = useState<BrowserInstanceSummary[]>([]);
  const [selectedWindowId, setSelectedWindowId] = useState<number | null>(null);
  const [tabs, setTabs] = useState<BrowserTabSummary[]>([]);
  const [snapshot, setSnapshot] = useState<XPageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<'refresh' | 'tabs' | 'navigate' | 'read' | 'disconnect' | null>(null);
  const [targetUrl, setTargetUrl] = useState('https://x.com/home');
  const [error, setError] = useState<string | null>(null);

  const selectedInstance = useMemo(
    () => instances.find(instance => instance.windowId === selectedWindowId) || null,
    [instances, selectedWindowId],
  );

  const refreshInstances = useCallback(async (baseUrl = apiUrl) => {
    if (!baseUrl) return;
    setWorking('refresh');
    setError(null);
    try {
      const nextInstances = await request<BrowserInstanceSummary[]>(baseUrl, '/control/instances');
      setInstances(nextInstances);
      if (selectedWindowId && nextInstances.some(instance => instance.windowId === selectedWindowId)) return;
      setSelectedWindowId(nextInstances.find(instance => instance.status === 'running')?.windowId || nextInstances[0]?.windowId || null);
      setTabs([]);
      setSnapshot(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法读取浏览器实例');
    } finally {
      setWorking(null);
      setLoading(false);
    }
  }, [apiUrl, selectedWindowId]);

  useEffect(() => {
    let active = true;
    CommonBridge.getApi()
      .then(info => {
        if (!active) return;
        setApiUrl(info.url);
        return refreshInstances(info.url);
      })
      .catch(requestError => {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : '本地控制 API 不可用');
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectInstance = (windowId: number) => {
    setSelectedWindowId(windowId);
    setTabs([]);
    setSnapshot(null);
    setError(null);
  };

  const loadTabs = async () => {
    if (!apiUrl || !selectedWindowId) return;
    setWorking('tabs');
    setError(null);
    try {
      setTabs(await request<BrowserTabSummary[]>(apiUrl, `/control/instances/${selectedWindowId}/tabs`));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法读取标签页');
    } finally {
      setWorking(null);
    }
  };

  const navigate = async () => {
    if (!apiUrl || !selectedWindowId || !targetUrl.trim()) return;
    setWorking('navigate');
    setError(null);
    try {
      const tab = await request<BrowserTabSummary>(apiUrl, `/control/instances/${selectedWindowId}/navigate`, {
        method: 'POST',
        body: JSON.stringify({url: targetUrl.trim()}),
      });
      setTabs(current => [tab, ...current.filter(item => item.targetId !== tab.targetId)]);
      message.success('已在指定实例中打开 X 页面');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '页面打开失败');
    } finally {
      setWorking(null);
    }
  };

  const readX = async () => {
    if (!apiUrl || !selectedWindowId) return;
    setWorking('read');
    setError(null);
    try {
      setSnapshot(await request<XPageSnapshot>(apiUrl, `/control/x/${selectedWindowId}/read?limit=20`));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'X 页面读取失败');
    } finally {
      setWorking(null);
    }
  };

  const disconnect = async () => {
    if (!apiUrl || !selectedWindowId) return;
    setWorking('disconnect');
    setError(null);
    try {
      await request<undefined>(apiUrl, `/control/instances/${selectedWindowId}/disconnect`, {method: 'POST'});
      message.success('已断开控制会话，浏览器实例不会被关闭');
      await refreshInstances();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '断开失败');
      setWorking(null);
    }
  };

  const runningCount = instances.filter(instance => instance.status === 'running').length;

  return (
    <div className="control-center">
      <section className="control-hero">
        <div className="control-hero-copy">
          <div className="control-kicker"><span className="control-kicker-dot" /> LOCAL ORCHESTRATION / MCP READY</div>
          <h1>浏览器控制中心</h1>
          <p>把账号、指纹环境和自动化动作放在同一个控制面板里。先选择实例，再让 Codex 或本地 MCP 连接器执行任务。</p>
          <div className="control-hero-meta">
            <Tag icon={<ApiOutlined />} color="cyan">本机 API 已连接</Tag>
            <span>{apiUrl || '正在连接本地服务…'}</span>
          </div>
        </div>
        <div className="control-hero-mark" aria-hidden="true">
          <div className="control-orbit control-orbit-one" />
          <div className="control-orbit control-orbit-two" />
          <ThunderboltOutlined />
        </div>
        <Button className="control-refresh" icon={<ReloadOutlined />} onClick={() => refreshInstances()} loading={working === 'refresh'}>
          刷新实例
        </Button>
      </section>

      {error && <Alert className="control-alert" type="error" showIcon message={error} closable onClose={() => setError(null)} />}

      <section className="control-stat-strip">
        <div><span>实例总数</span><strong>{instances.length}</strong></div>
        <div><span>可连接</span><strong className="stat-accent">{runningCount}</strong></div>
        <div><span>当前目标</span><strong>{selectedInstance?.name || '未选择'}</strong></div>
        <div className="stat-note"><SafetyCertificateOutlined /><span>登录态保留在各自指纹环境中，控制层不会读取密码或 Cookie。</span></div>
      </section>

      <div className="control-layout">
        <section className="control-panel instance-panel">
          <div className="panel-heading">
            <div><span className="panel-eyebrow">01 / TARGETS</span><h2>浏览器实例</h2></div>
            <Tag color={runningCount ? 'green' : 'default'}>{runningCount} running</Tag>
          </div>
          <p className="panel-caption">选择一个实例作为 Codex 的明确执行目标。</p>
          <div className="instance-list">
            {loading ? <div className="control-loading"><Spin indicator={<LoadingOutlined spin />} /> 正在读取实例…</div> : instances.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有可控制的浏览器实例" />
            ) : instances.map(instance => (
              <button
                key={instance.windowId}
                className={`instance-item ${selectedWindowId === instance.windowId ? 'selected' : ''}`}
                onClick={() => selectInstance(instance.windowId)}
              >
                <span className={`instance-pulse ${instance.status}`} />
                <span className="instance-main">
                  <strong>{instance.name || `实例 ${instance.windowId}`}</strong>
                  <small>windowId {instance.windowId}{instance.profileId ? ` · profile ${instance.profileId}` : ''}</small>
                </span>
                <span className="instance-status">{statusLabel(instance.status)}</span>
              </button>
            ))}
          </div>
          <div className="instance-tip"><LinkOutlined /> 账号映射建议：accountId → windowId。不要把账号密码写入任务。</div>
        </section>

        <section className="control-panel action-panel">
          <div className="panel-heading action-heading">
            <div><span className="panel-eyebrow">02 / ACTIONS</span><h2>{selectedInstance?.name || '选择一个目标实例'}</h2></div>
            {selectedInstance && <Tag icon={<CheckCircleOutlined />} color={selectedInstance.cdpReady ? 'green' : 'orange'}>{selectedInstance.cdpReady ? 'CDP ready' : '等待 CDP'}</Tag>}
          </div>
          <p className="panel-caption">当前控制面板只执行 X 导航与读取动作，评论、点赞、发帖仍需单独的确认流程。</p>
          <div className="action-toolbar">
            <Button type="primary" icon={<GlobalOutlined />} disabled={!selectedInstance} loading={working === 'navigate'} onClick={navigate}>打开 X</Button>
            <Button icon={<PlayCircleOutlined />} disabled={!selectedInstance} loading={working === 'read'} onClick={readX}>读取 X 页面</Button>
            <Tooltip title="只断开控制连接，不关闭浏览器">
              <Button danger ghost icon={<DisconnectOutlined />} disabled={!selectedInstance} loading={working === 'disconnect'} onClick={disconnect}>断开</Button>
            </Tooltip>
          </div>
          <Input
            className="target-url"
            prefix={<GlobalOutlined />}
            value={targetUrl}
            onChange={event => setTargetUrl(event.target.value)}
            placeholder="https://x.com/home"
            onPressEnter={navigate}
            disabled={!selectedInstance}
          />

          <div className="workspace-grid">
            <div className="workspace-card">
              <div className="workspace-card-heading"><span>打开的标签页</span><Button type="text" size="small" icon={<ReloadOutlined />} onClick={loadTabs} loading={working === 'tabs'} disabled={!selectedInstance}>刷新</Button></div>
              {tabs.length === 0 ? <div className="workspace-empty">点击“刷新”读取当前实例标签页</div> : <div className="tab-list">{tabs.map(tab => <div className="tab-row" key={tab.targetId}><span className={`tab-dot ${tab.isXPage ? 'x' : ''}`} /><div><strong>{tab.title || '未命名标签页'}</strong><small>{tab.url}</small></div></div>)}</div>}
            </div>
            <div className="workspace-card x-card">
              <div className="workspace-card-heading"><span>X 页面快照</span>{snapshot && <Tag color={snapshot.loginLikely ? 'orange' : 'green'}>{snapshot.loginLikely ? '需要登录' : '可能已登录'}</Tag>}</div>
              {!snapshot ? <div className="workspace-empty">读取后显示可见推文结构化快照</div> : <div className="snapshot-content"><small>{snapshot.title || snapshot.url}</small><strong>{snapshot.tweets.length} 条推文</strong>{snapshot.tweets.slice(0, 3).map(tweet => <div className="tweet-preview" key={tweet.tweetId}><span>#{tweet.tweetId}</span>{tweet.text}</div>)}</div>}
            </div>
          </div>
        </section>
      </div>

      <section className="control-footer-grid">
        <div className="control-panel mcp-panel"><div className="panel-heading"><div><span className="panel-eyebrow">03 / CONNECTOR</span><h2>让 Codex 接入</h2></div><Tag color="purple">MCP</Tag></div><p className="panel-caption">本地连接器把实例选择和页面读取暴露成 Codex 可调用的工具。</p><code>npm run mcp:server</code><div className="tool-chips"><span>list_instances</span><span>list_tabs</span><span>navigate</span><span>read_x</span></div></div>
        <div className="control-panel guardrail-panel"><div className="panel-heading"><div><span className="panel-eyebrow">GUARDRAILS</span><h2>操作边界</h2></div><SafetyCertificateOutlined className="guardrail-icon" /></div><div className="guardrail-list"><div><span>读取</span><strong>可自动执行</strong></div><div><span>登录</span><strong>用户手动完成</strong></div><div><span>评论 / 点赞</span><strong>增加确认后再开放</strong></div></div></div>
      </section>
    </div>
  );
};

export default ControlCenter;
