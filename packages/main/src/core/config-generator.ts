import yaml from 'js-yaml';
import type { ParsedNode } from './uri-parser';

export interface NodeConfig {
  id: number;
  name: string;
  config: ParsedNode;
  localPort: number;
}

export class ConfigGenerator {
  /**
   * 生成 mihomo 配置文件 YAML
   */
  static generate(nodes: NodeConfig[], apiSecret: string, apiPort = 9090): string {
    // 如果没有节点，生成最小配置（空运行）
    if (nodes.length === 0) {
      return yaml.dump({
        'mixed-port': 0,
        'allow-lan': false,
        'bind-address': '127.0.0.1',
        'external-controller': `127.0.0.1:${apiPort}`,
        secret: apiSecret,
        proxies: [],
        'proxy-groups': [],
        listeners: [],
        rules: ['MATCH,REJECT'],
        dns: this.getDNSConfig()
      });
    }

    const proxies = nodes.map(({ id, name, config }) => {
      const proxyName = `node-${id}`;
      const proxyConfig: any = {
        name: proxyName,
        type: config.type,
        server: config.server,
        port: config.port,
        'udp': true
      };

      // 根据类型填充具体配置
      this.fillProxyConfig(proxyConfig, config);

      return proxyConfig;
    });

    // 每个节点一个独立的 proxy-group（用于 selector 和 listener 绑定）
    const proxyGroups = nodes.map(({ id }) => ({
      name: `pg-${id}`,
      type: 'select',
      proxies: [`node-${id}`]
    }));

    // 每个节点一个 listener（入站代理端口）
    const listeners = nodes.map(({ id, localPort }) => ({
      name: `in-${id}`,
      type: 'mixed',
      port: localPort,
      'bind-address': '127.0.0.1',
      // 直接绑定到对应的 proxy-group
      proxy: `pg-${id}`
    }));

    // 兜底规则：拒绝所有未匹配流量（因为所有流量都走 listener 定向了）
    // listener.proxy 已经把每个本地端口绑定到对应节点。
    // 不能用 SRC-IP-CIDR 兜底：客户端源地址并不会按节点变成 127.0.0.x，
    // 该规则会把正常请求错误地送进 REJECT。
    const rules = ['MATCH,DIRECT'];

    const config = {
      'mixed-port': 0,
      'allow-lan': false,
      'bind-address': '127.0.0.1',
      'external-controller': `127.0.0.1:${apiPort}`,
      secret: apiSecret,
      'external-ui': '',
      proxies: proxies,
      'proxy-groups': proxyGroups,
      listeners: listeners,
      rules: rules,
      dns: this.getDNSConfig()
    };

    return yaml.dump(config);
  }

  /**
   * 根据节点类型填充代理配置
   */
  private static fillProxyConfig(proxyConfig: any, config: ParsedNode): void {
    const raw = config as any;
    const servername = config.sni || raw.servername || raw['server-name'] || '';
    const fingerprint = config.fp || raw['client-fingerprint'] || 'chrome';
    const reality = config.realityOpts || raw['reality-opts'];

    switch (config.type) {
      case 'vless':
        proxyConfig.uuid = config.uuid || '';
        proxyConfig.encryption = config.encryption || 'none';
        proxyConfig.flow = config.flow || '';
        proxyConfig.tls = config.tls ?? true;
        proxyConfig['skip-cert-verify'] = config.skipCertVerify ?? false;
        proxyConfig.servername = servername;
        proxyConfig['client-fingerprint'] = fingerprint;
        if (reality) {
          const publicKey = reality.publicKey || reality['public-key'];
          const shortId = reality.shortId || reality['short-id'];
          if (!publicKey || !shortId) break;
          proxyConfig['reality-opts'] = {
            'public-key': publicKey,
            'short-id': shortId
          };
        }
        proxyConfig.network = config.network || 'tcp';
        break;

      case 'vmess':
        proxyConfig.uuid = config.uuid || '';
        proxyConfig.alterId = config.alterId ?? 0;
        proxyConfig.cipher = config.cipher || 'auto';
        proxyConfig.tls = config.tls ?? false;
        proxyConfig['skip-cert-verify'] = config.skipCertVerify ?? false;
        proxyConfig.servername = servername;
        proxyConfig['client-fingerprint'] = fingerprint;
        proxyConfig.network = config.network || 'tcp';
        const wsOpts = config.wsOpts || raw['ws-opts'];
        if (wsOpts) {
          proxyConfig['ws-opts'] = {
            path: wsOpts.path || '/',
            headers: wsOpts.headers || {}
          };
        }
        const grpcOpts = raw['grpc-opts'];
        if (config.headers || grpcOpts) {
          proxyConfig['grpc-opts'] = {
            'grpc-service-name': config.headers?.['grpc-service-name'] || grpcOpts?.['grpc-service-name'] || ''
          };
        }
        break;

      case 'trojan':
        proxyConfig.password = config.password || '';
        proxyConfig.tls = config.tls ?? true;
        proxyConfig['skip-cert-verify'] = config.skipCertVerify ?? false;
        proxyConfig.servername = servername;
        proxyConfig['client-fingerprint'] = fingerprint;
        proxyConfig.network = config.network || 'tcp';
        break;

      case 'ss':
        proxyConfig.password = config.password || '';
        proxyConfig.cipher = config.method || config.encryption || 'aes-256-gcm';
        if (config.plugin) {
          proxyConfig.plugin = config.plugin;
        }
        break;

      case 'hysteria2':
        proxyConfig.password = config.password || '';
        proxyConfig.tls = config.tls ?? true;
        proxyConfig['skip-cert-verify'] = config.skipCertVerify ?? false;
        proxyConfig.servername = config.sni || '';
        if (config.alpn && config.alpn.length > 0) {
          proxyConfig.alpn = config.alpn;
        }
        if (config.headers) {
          proxyConfig['custom-headers'] = config.headers;
        }
        break;

      case 'tuic':
        proxyConfig.uuid = config.uuid || '';
        proxyConfig.token = config.password || '';
        proxyConfig.tls = config.tls ?? true;
        proxyConfig['skip-cert-verify'] = config.skipCertVerify ?? false;
        proxyConfig.servername = config.sni || '';
        if (config.alpn && config.alpn.length > 0) {
          proxyConfig.alpn = config.alpn;
        }
        break;

      default:
        // 未知类型，保留基础字段
        break;
    }
  }

  /**
   * DNS 配置（防泄露）
   */
  private static getDNSConfig(): any {
    return {
      enable: true,
      ipv6: false,
      'default-nameserver': ['223.5.5.5', '119.29.29.29'],
      'enhanced-mode': 'fake-ip',
      'fake-ip-range': '198.18.0.1/16',
      'use-hosts': true,
      nameserver: [
        'https://doh.pub/dns-query',
        'https://dns.alidns.com/dns-query'
      ],
      fallback: [
        'https://223.5.5.5/dns-query',
        'https://223.6.6.6/dns-query'
      ],
      'fallback-filter': {
        geoip: true,
        ipcidr: ['240.0.0.0/4', '0.0.0.0/32']
      }
    };
  }
}
