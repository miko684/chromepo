#!/usr/bin/env node

const apiBase = (process.env.CHROME_POWER_API_URL || 'http://127.0.0.1:49156').replace(/\/$/, '');
let inputBuffer = Buffer.alloc(0);

const tools = [
  {
    name: 'chrome_power_list_instances',
    description: 'List ChromePower fingerprint browser instances and their CDP readiness.',
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
  },
  {
    name: 'chrome_power_list_tabs',
    description: 'List tabs in one ChromePower browser instance.',
    inputSchema: {type: 'object', properties: {windowId: {type: 'integer', minimum: 1}}, required: ['windowId'], additionalProperties: false},
  },
  {
    name: 'chrome_power_navigate',
    description: 'Navigate one ChromePower browser instance to an HTTPS X page.',
    inputSchema: {type: 'object', properties: {windowId: {type: 'integer', minimum: 1}, url: {type: 'string', description: 'An https://x.com or https://twitter.com URL'}}, required: ['windowId', 'url'], additionalProperties: false},
  },
  {
    name: 'chrome_power_read_x',
    description: 'Read a bounded structured snapshot of visible X tweets from one instance.',
    inputSchema: {type: 'object', properties: {windowId: {type: 'integer', minimum: 1}, limit: {type: 'integer', minimum: 1, maximum: 50, default: 20}}, required: ['windowId'], additionalProperties: false},
  },
  {
    name: 'chrome_power_disconnect',
    description: 'Disconnect the control session without closing the browser instance.',
    inputSchema: {type: 'object', properties: {windowId: {type: 'integer', minimum: 1}}, required: ['windowId'], additionalProperties: false},
  },
];

const apiRequest = async (path, init = {}) => {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {'content-type': 'application/json', ...(init.headers || {})},
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(body.message || `ChromePower API HTTP ${response.status}`);
  return body.data ?? body;
};

const callTool = async (name, args = {}) => {
  const windowId = encodeURIComponent(String(args.windowId));
  if (name === 'chrome_power_list_instances') return apiRequest('/control/instances');
  if (name === 'chrome_power_list_tabs') return apiRequest(`/control/instances/${windowId}/tabs`);
  if (name === 'chrome_power_navigate') return apiRequest(`/control/instances/${windowId}/navigate`, {method: 'POST', body: JSON.stringify({url: args.url})});
  if (name === 'chrome_power_read_x') return apiRequest(`/control/x/${windowId}/read?limit=${encodeURIComponent(String(args.limit ?? 20))}`);
  if (name === 'chrome_power_disconnect') return apiRequest(`/control/instances/${windowId}/disconnect`, {method: 'POST'});
  throw new Error(`Unknown tool: ${name}`);
};

const send = message => {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
};

const handle = async message => {
  if (!message.id) return;
  try {
    if (message.method === 'initialize') {
      send({jsonrpc: '2.0', id: message.id, result: {protocolVersion: message.params?.protocolVersion || '2024-11-05', capabilities: {tools: {}}, serverInfo: {name: 'chrome-power', version: '1.0.0'}}});
      return;
    }
    if (message.method === 'ping') {
      send({jsonrpc: '2.0', id: message.id, result: {}});
      return;
    }
    if (message.method === 'tools/list') {
      send({jsonrpc: '2.0', id: message.id, result: {tools}});
      return;
    }
    if (message.method === 'tools/call') {
      const data = await callTool(message.params?.name, message.params?.arguments || {});
      send({jsonrpc: '2.0', id: message.id, result: {content: [{type: 'text', text: JSON.stringify(data, null, 2)}]}});
      return;
    }
    send({jsonrpc: '2.0', id: message.id, error: {code: -32601, message: `Method not found: ${message.method}`}});
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (message.method === 'tools/call') send({jsonrpc: '2.0', id: message.id, result: {isError: true, content: [{type: 'text', text}]}});
    else send({jsonrpc: '2.0', id: message.id, error: {code: -32000, message: text}});
  }
};

const consume = () => {
  while (true) {
    const separator = inputBuffer.indexOf('\r\n\r\n');
    if (separator < 0) return;
    const headers = inputBuffer.subarray(0, separator).toString('utf8');
    const match = headers.match(/content-length:\s*(\d+)/i);
    if (!match) {
      inputBuffer = inputBuffer.subarray(separator + 4);
      continue;
    }
    const length = Number(match[1]);
    const start = separator + 4;
    if (inputBuffer.length < start + length) return;
    const payload = inputBuffer.subarray(start, start + length).toString('utf8');
    inputBuffer = inputBuffer.subarray(start + length);
    void handle(JSON.parse(payload));
  }
};

process.stdin.on('data', chunk => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  consume();
});

process.stdin.on('end', () => process.exit(0));
