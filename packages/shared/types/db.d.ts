// types/models.d.ts

export namespace DB {
  export interface Window {
    id?: number;
    profile_id?: string;
    name?: string;
    group_id?: number | null;
    group_name?: string;
    tags?: number[] | string[] | null | string;
    remark?: string;
    opened_at?: string;
    created_at?: string;
    updated_at?: string;
    ua?: string;
    fingerprint?: string;
    fingerprint_report?: string | null;
    cookie?: string;
    /** 0: removed; 1: closed; 2: running; 3: Preparing  */
    status?: number;

    ip?: string;
    port?: number | null;
    pid?: number | null;
    local_proxy_port?: number; // 🆕 mihomo 分配的本地代理端口

    proxy_id?: number | null;
    proxy?: string;
    proxy_type?: string;
    ip_country?: string;
    ip_checker?: string;
    tags_name?: string[];
    fingerprintConfig?: FingerprintConfig;
  }

  /** Stable, per-profile browser fingerprint configuration. */
  export interface FingerprintConfig {
    templateId?: string;
    snapshotVersion?: number;
    generatedAt?: string;
    seed?: number;
    ua?: string;
    platform?: string;
    platformVersion?: string;
    architecture?: string;
    bitness?: string;
    languageMode?: 'ip' | 'system' | 'custom';
    language?: string;
    timezoneMode?: 'ip' | 'system' | 'custom';
    customTimezone?: string;
    screenMode?: 'default' | 'custom';
    screenResolution?: string;
    locationMode?: 'ip' | 'custom' | 'disabled';
    customLatitude?: number;
    customLongitude?: number;
    webRTCMode?: 'proxy' | 'real' | 'disabled';
    doNotTrack?: 'unspecified' | '1' | '0';
    canvasMode?: 'noise' | 'real';
    webGLMode?: 'noise' | 'real';
    webGLVendor?: string;
    webGLRenderer?: string;
    audioMode?: 'noise' | 'real';
    clientRectsMode?: 'noise' | 'real';
    hardwareConcurrency?: number;
    deviceMemory?: number;
    webGPUMode?: 'custom' | 'real' | 'disabled';
    webGPUVendor?: string;
    webGPUArchitecture?: string;
    webGPUDevice?: string;
    fontTemplate?: 'windows-standard' | 'windows-office' | 'windows-cjk' | string;
    fonts?: string[];
    cameraCount?: number;
    microphoneCount?: number;
    speakerCount?: number;
    notificationPermission?: 'prompt' | 'granted' | 'denied';
    geolocationPermission?: 'prompt' | 'granted' | 'denied';
    cameraPermission?: 'prompt' | 'granted' | 'denied';
    microphonePermission?: 'prompt' | 'granted' | 'denied';
    devicePixelRatio?: number;
    colorDepth?: number;
    pixelDepth?: number;
    maxTouchPoints?: number;
    prefersColorScheme?: 'light' | 'dark';
    speechVoices?: string[];
    [key: string]: SafeAny;
  }

  export interface FingerprintHealthCheck {
    key: string;
    label: string;
    status: 'pass' | 'warning' | 'fail';
    message?: string;
    expected?: string;
    actual?: string;
  }

  export interface FingerprintHealthReport {
    status: 'healthy' | 'warning' | 'error';
    score: number;
    checkedAt: string;
    templateId?: string;
    browserVersion?: string;
    proxyIp?: string;
    fingerprintDigest?: string;
    items: FingerprintHealthCheck[];
  }

  export interface Proxy {
    id?: number;
    ip?: string;
    proxy?: string; // 兼容旧格式: host:port:username:password
    host?: string;
    proxy_type?: string; // http | socks5 | vless | vmess | trojan | ss | hysteria2 | tuic
    node_name?: string | null;
    ip_checker?: 'ip2location' | 'geoip';
    ip_country?: string;
    check_result?: string;
    checking?: boolean;
    remark?: string;
    usageCount?: number;
    created_at?: string;
    updated_at?: string;

    // 🆕 mihomo 专属字段
    node_config?: string | null; // JSON 字符串，存储完整节点配置
    local_port?: number | null; // mihomo 分配的本地端口
    latency?: number | null; // 延迟 ms
    status?: 'active' | 'inactive' | 'error' | null;
    last_check?: string | null;
  }

  export interface Group {
    id?: number;
    name?: string;
  }

  export interface Tag {
    id?: number;
    name?: string;
    color?: string;
  }

  export interface Extension {
    id?: number;
    name: string;
    version: string;
    path: string;
    windows?: number[] | string;
    icon?: string;
    description?: string;
    created_at?: string;
    updated_at?: string;
  }

  export interface WindowExtension {
    id?: number;
    extension_id?: number;
    window_id?: number;
  }

  // 🆕 窗口代理绑定关系（用于追踪）
  export interface WindowProxyBinding {
    window_id: number;
    proxy_id: number;
    local_port: number;
    bound_at: string;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SafeAny = any;
