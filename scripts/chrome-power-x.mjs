#!/usr/bin/env node

const args = process.argv.slice(2);
const command = args[0];
const apiBase = (process.env.CHROME_POWER_API_URL || 'http://127.0.0.1:49156').replace(/\/$/, '');

const getArg = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const requiredArg = name => {
  const value = getArg(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const request = async (path, options = {}) => {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {'content-type': 'application/json', ...(options.headers || {})},
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new Error(body.message || `Chrome Power API returned HTTP ${response.status}.`);
  }
  return body;
};

const usage = () => {
  console.error(`Usage:
  node scripts/chrome-power-x.mjs instances
  node scripts/chrome-power-x.mjs tabs --window-id <id>
  node scripts/chrome-power-x.mjs read --window-id <id> [--limit <n>]
  node scripts/chrome-power-x.mjs navigate --window-id <id> --url <https://x.com/...>

Set CHROME_POWER_API_URL when the local API is not on port 49156.`);
};

try {
  let result;
  if (command === 'instances') {
    result = await request('/control/instances');
  } else if (command === 'tabs') {
    result = await request(`/control/instances/${encodeURIComponent(requiredArg('--window-id'))}/tabs`);
  } else if (command === 'read') {
    const limit = getArg('--limit') || '20';
    result = await request(`/control/x/${encodeURIComponent(requiredArg('--window-id'))}/read?limit=${encodeURIComponent(limit)}`);
  } else if (command === 'navigate') {
    result = await request(`/control/instances/${encodeURIComponent(requiredArg('--window-id'))}/navigate`, {
      method: 'POST',
      body: JSON.stringify({url: requiredArg('--url')}),
    });
  } else {
    usage();
    process.exitCode = 2;
  }

  if (result) console.log(JSON.stringify(result.data ?? result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
