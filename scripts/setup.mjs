/**
 * 初始化本地 data/：从 data.example/ 复制一份作为起点。
 * 已存在则跳过，避免覆盖真实数据。跨平台（Node fs 实现）。
 */
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'data.example');
const dest = path.join(root, 'data');

if (existsSync(dest)) {
  console.log('data/ 已存在，跳过复制。');
} else {
  cpSync(src, dest, { recursive: true });
  console.log('已从 data.example/ 复制生成 data/。');
}
