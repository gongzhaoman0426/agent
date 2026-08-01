import fs from 'node:fs';
import path from 'node:path';
import { wechatSyncBufPath } from './wechat.paths.js';

export function loadGetUpdatesBuf(accountId: string): string {
  const filePath = wechatSyncBufPath(accountId);
  try {
    if (!fs.existsSync(filePath)) return '';
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as { get_updates_buf?: string };
    return typeof parsed.get_updates_buf === 'string'
      ? parsed.get_updates_buf
      : '';
  } catch {
    return '';
  }
}

export function saveGetUpdatesBuf(accountId: string, buf: string): void {
  const filePath = wechatSyncBufPath(accountId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    JSON.stringify({ get_updates_buf: buf }, null, 0),
    'utf-8',
  );
}
