import {createHash} from 'crypto';
import {expect, test, vi} from 'vitest';

const exposed = vi.hoisted(() => new Map<string, unknown>());

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn((name: string, value: unknown) => exposed.set(name, value)),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    removeListener: vi.fn(),
  },
}));

import '../src';

test('versions', async () => {
  expect(exposed.get('versions')).toBe(process.versions);
});

test('nodeCrypto', async () => {
  // Test hashing a random string.
  const testString = Math.random().toString(36).slice(2, 7);
  const expectedHash = createHash('sha256').update(testString).digest('hex');

  const sha256sum = exposed.get('sha256sum') as (value: string) => string;
  expect(sha256sum(testString)).toBe(expectedHash);
});
