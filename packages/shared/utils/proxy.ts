import type {AxiosProxyConfig} from 'axios';

export const getRequestProxy = (
  proxy: string,
  proxy_type: string,
): AxiosProxyConfig | undefined => {
  if (!proxy) return;
  // 兼容 host:port[:username:password] 以及带协议的代理地址。
  // 旧实现直接 split(':')，遇到 IPv6、密码中包含冒号或 URL 格式时会生成错误配置。
  let value = proxy.trim();
  if (!value.includes('://')) value = `${proxy_type.toLowerCase()}://${value}`;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }

  const protocol = proxy_type.toLocaleLowerCase();
  return {
    // Axios 只接受 http/https/socks 等协议名，不要把 mihomo 当成上游协议。
    protocol: protocol === 'https' ? 'https' : 'http',
    host: parsed.hostname,
    port: Number(parsed.port),
    auth: parsed.username
      ? { username: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password) }
      : undefined,
  };
};
