// 使用这种方式，而非从 'node:crypto' 导入
import { createHash, type BinaryLike } from 'crypto';

export function sha256sum(data: BinaryLike): string {
  return createHash('sha256').update(data).digest('hex');
}