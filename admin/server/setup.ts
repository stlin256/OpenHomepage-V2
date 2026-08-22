/**
 * 编辑器启动时确保 data/ 存在：缺失时自动从 data.example/ 初始化
 * （与 scripts/setup.mjs 同逻辑，抽为可复用函数）。
 */
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';

export interface EnsureResult {
  dataDir: string;
  /** true 表示本次启动从 data.example/ 自动初始化 */
  initialized: boolean;
}

export function ensureDataDir(root: string): EnsureResult {
  const dataDir = path.join(root, 'data');
  if (existsSync(dataDir)) return { dataDir, initialized: false };
  const exampleDir = path.join(root, 'data.example');
  if (!existsSync(exampleDir)) {
    throw new Error(
      '未找到 data/ 或 data.example/，请先运行 npm run setup 初始化数据目录。 / ' +
        'Neither data/ nor data.example/ exists; run `npm run setup` first.'
    );
  }
  cpSync(exampleDir, dataDir, { recursive: true });
  return { dataDir, initialized: true };
}
