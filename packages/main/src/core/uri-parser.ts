/**
 * 支持 6 种代理协议的 URI 解析器
 * vless:// vmess:// trojan:// ss:// hysteria2:// tuic://
 */

export interface ParsedNode {
  type: string;
  name: string;
  server: string;
  port: number;
  uuid?: string;
  password?: string;
  encryption?: string;
  flow?: string;
  security?: string;
  sni?: string;
  fp?: string;
  realityOpts?: { publicKey: string; shortId: string };
  network?: string;
  tls?: boolean;
  skipCertVerify?: boolean;
  alterId?: number;
  cipher?: string;
  wsOpts?: { path: string; headers: Record<string, string> };
  method?: string;
  plugin?: string;
  headers?: Record<string, string>;
  alpn?: string[];
}

export class URIParser {
  /**
   * 解析代理 URI，自动检测协议类型
   */
  parse(uri: string): ParsedNode {
    const trimmed = uri.trim();

    if (trimmed.startsWith('vless://')) {
      return this.parseVless(trimmed);
    }
    if (trimmed.startsWith('vmess://')) {
      return this.parseVmess(trimmed);
    }
    if (trimmed.startsWith('trojan://')) {
      return this.parseTrojan(trimmed);
    }
    if (trimmed.startsWith('ss://')) {
      return this.parseShadowsocks(trimmed);
    }
    if (trimmed.startsWith('hysteria2://') || trimmed.startsWith('hy2://')) {
      return this.parseHysteria2(trimmed);
    }
    if (trimmed.startsWith('tuic://')) {
      return this.parseTuic(trimmed);
    }

    throw new Error(`Unsupported protocol: ${trimmed.substring(0, 20)}...`);
  }

  /**
   * 解析 VLESS 链接
   * vless://uuid@server:port?encryption=none&flow=xtls-rprx-vision&security=reality&sni=cdn.jsdelivr.net&fp=chrome&pbk=xxx&sid=xxx&type=tcp
   */
  private parseVless(uri: string): ParsedNode {
    const url = new URL(uri);
    const params = url.searchParams;

    const node: ParsedNode = {
      type: 'vless',
      name: decodeURIComponent(url.hash.slice(1)) || url.hostname || 'vless-node',
      server: url.hostname,
      port: parseInt(url.port) || 443,
      uuid: url.username || undefined,
      encryption: params.get('encryption') || 'none',
      flow: params.get('flow') || '',
      security: params.get('security') || '',
      sni: params.get('sni') || '',
      fp: params.get('fp') || 'chrome',
      network: params.get('type') || 'tcp',
      tls: true
    };

    // Reality 参数
    const pbk = params.get('pbk');
    const sid = params.get('sid');
    if (pbk && sid) {
      node.realityOpts = {
        publicKey: pbk,
        shortId: sid
      };
      node.security = 'reality';
    }

    // 允许跳过证书验证
    const skipCert = params.get('skip-cert-verify');
    if (skipCert === 'true' || skipCert === '1') {
      node.skipCertVerify = true;
    }

    // UDP 支持（默认开启）
    return node;
  }

  /**
   * 解析 VMess 链接
   * vmess://base64(json)
   */
  private parseVmess(uri: string): ParsedNode {
    const base64Str = uri.replace('vmess://', '');
    let jsonStr: string;

    // 尝试 Base64 解码
    try {
      jsonStr = Buffer.from(base64Str, 'base64').toString('utf-8');
    } catch (e) {
      throw new Error('Invalid VMess base64 encoding');
    }

    let obj: any;
    try {
      obj = JSON.parse(jsonStr);
    } catch (e) {
      throw new Error('Invalid VMess JSON format');
    }

    const node: ParsedNode = {
      type: 'vmess',
      name: obj.ps || obj.remarks || obj.host || obj.add || 'vmess-node',
      server: obj.add || '',
      port: parseInt(obj.port) || 443,
      uuid: obj.id || '',
      alterId: obj.aid || obj.alterId || 0,
      cipher: obj.scy || obj.cipher || 'auto',
      network: obj.net || 'tcp',
      tls: obj.tls === 'tls' || obj.tls === 'true' || obj.security === 'tls',
      skipCertVerify: obj.allowInsecure === 1 || obj.allowInsecure === true,
      sni: obj.sni || obj.host || '',
      fp: obj.fp || 'chrome'
    };

    // WebSocket 选项
    if (obj.net === 'ws' && obj.path) {
      node.wsOpts = {
        path: obj.path || '/',
        headers: { Host: obj.host || '' }
      };
    }

    // 其他网络类型参数保留
    if (obj.net === 'grpc') {
      // gRPC 支持
      node.headers = { 'grpc-service-name': obj.serviceName || '' };
    }

    return node;
  }

  /**
   * 解析 Trojan 链接
   * trojan://password@server:port?security=tls&sni=xxx&fp=chrome&type=tcp
   */
  private parseTrojan(uri: string): ParsedNode {
    const url = new URL(uri);
    const params = url.searchParams;

    return {
      type: 'trojan',
      name: decodeURIComponent(url.hash.slice(1)) || url.hostname || 'trojan-node',
      server: url.hostname,
      port: parseInt(url.port) || 443,
      password: url.username || undefined,
      sni: params.get('sni') || '',
      fp: params.get('fp') || 'chrome',
      network: params.get('type') || 'tcp',
      tls: params.get('security') !== 'none',
      skipCertVerify: params.get('allowInsecure') === 'true' || params.get('skip-cert-verify') === 'true'
    };
  }

  /**
   * 解析 Shadowsocks 链接
   * ss://method:password@server:port#name
   * 或 ss://base64(method:password@server:port)#name
   */
  private parseShadowsocks(uri: string): ParsedNode {
    const withoutPrefix = uri.replace('ss://', '');

    // 处理带 #name 的情况
    let name = '';
    let content = withoutPrefix;
    const hashIndex = content.indexOf('#');
    if (hashIndex !== -1) {
      name = decodeURIComponent(content.substring(hashIndex + 1));
      content = content.substring(0, hashIndex);
    }

    // 判断是否是 Base64 编码（标准格式包含 @ 则不完全是 base64）
    if (!content.includes('@')) {
      // 尝试 Base64 解码
      try {
        const decoded = Buffer.from(content, 'base64').toString('utf-8');
        // 如果解码后包含 @，说明是完整的 URL 格式
        if (decoded.includes('@')) {
          content = decoded;
        } else {
          // 否则可能是插件格式或其他
          // 尝试按 JSON 解析
          try {
            const obj = JSON.parse(decoded);
            return {
              type: 'ss',
              name: name || obj.name || obj.remarks || obj.server || 'ss-node',
              server: obj.server || '',
              port: parseInt(obj.port) || 443,
              method: obj.method || '',
              password: obj.password || '',
              encryption: obj.method || '',
              plugin: obj.plugin || ''
            };
          } catch (e) {
            // 不是 JSON，尝试解析为 method:password@server:port
            // 但已经确认不包含 @，抛出错误
            throw new Error('Invalid Shadowsocks format');
          }
        }
      } catch (e) {
        throw new Error('Invalid Shadowsocks base64 encoding');
      }
    }

    // 标准格式: method:password@server:port
    const [auth, serverPort] = content.split('@');
    const colonIndex = auth.indexOf(':');
    if (colonIndex === -1) {
      throw new Error('Invalid Shadowsocks auth format: missing method:password');
    }
    const method = auth.substring(0, colonIndex);
    const password = auth.substring(colonIndex + 1);

    const [server, portStr] = serverPort.split(':');
    const port = parseInt(portStr) || 443;

    return {
      type: 'ss',
      name: name || server || 'ss-node',
      server: server || '',
      port: port,
      method: method || '',
      password: password || '',
      encryption: method || ''
    };
  }

  /**
   * 解析 Hysteria2 链接
   * hysteria2://server:port?auth=xxx&insecure=true&sni=xxx
   */
  private parseHysteria2(uri: string): ParsedNode {
    // 兼容 hy2:// 前缀
    const normalized = uri.replace('hy2://', 'hysteria2://');
    const url = new URL(normalized);
    const params = url.searchParams;

    return {
      type: 'hysteria2',
      name: decodeURIComponent(url.hash.slice(1)) || url.hostname || 'hysteria2-node',
      server: url.hostname,
      port: parseInt(url.port) || 443,
      password: params.get('auth') || params.get('password') || '',
      sni: params.get('sni') || '',
      tls: params.get('insecure') !== 'true' && params.get('allowInsecure') !== 'true',
      skipCertVerify: params.get('insecure') === 'true' || params.get('allowInsecure') === 'true',
      // Hysteria2 特有
      headers: params.get('headers') ? JSON.parse(params.get('headers')!) : undefined,
      alpn: params.get('alpn') ? params.get('alpn')!.split(',') : undefined
    };
  }

  /**
   * 解析 TUIC 链接
   * tuic://uuid@server:port?token=xxx&sni=xxx&alpn=h3,h2
   */
  private parseTuic(uri: string): ParsedNode {
    const url = new URL(uri);
    const params = url.searchParams;

    return {
      type: 'tuic',
      name: decodeURIComponent(url.hash.slice(1)) || url.hostname || 'tuic-node',
      server: url.hostname,
      port: parseInt(url.port) || 443,
      uuid: url.username || undefined,
      password: params.get('token') || '',
      sni: params.get('sni') || '',
      tls: true,
      alpn: params.get('alpn') ? params.get('alpn')!.split(',') : undefined,
      skipCertVerify: params.get('allowInsecure') === 'true' || params.get('skip-cert-verify') === 'true'
    };
  }

  /**
   * 批量解析（每行一个 URI）
   */
  parseBatch(text: string): ParsedNode[] {
    const lines = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));

    const results: ParsedNode[] = [];
    const errors: { line: string; error: string }[] = [];

    for (const line of lines) {
      try {
        results.push(this.parse(line));
      } catch (e) {
        errors.push({ line: line.substring(0, 50), error: (e as Error).message });
      }
    }

    if (errors.length > 0 && results.length === 0) {
      throw new Error(`All ${errors.length} lines failed to parse. First error: ${errors[0].error}`);
    }

    return results;
  }
}