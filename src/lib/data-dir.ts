/**
 * data 根目录解析：构建/开发时优先使用 data/（真实内容，不入库），
 * 本地缺失时回退 data.example/（示例数据，入库）并打印 warning，
 * 保证 clone 后无需 npm run setup 即可 npm run dev / build。
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

export function resolveDataDir(
  root: string,
  warn: (msg: string) => void = console.warn,
): string {
  const dataDir = path.join(root, 'data');
  if (existsSync(dataDir)) return dataDir;
  const exampleDir = path.join(root, 'data.example');
  if (existsSync(exampleDir)) {
    warn(
      '未找到 data/，本次构建使用 data.example/ 示例数据；' +
        '运行 npm run setup 可从示例初始化真实 data/。\n' +
        'data/ not found; building from data.example/ sample data. ' +
        'Run `npm run setup` to initialize your own data/.'
    );
    return exampleDir;
  }
  throw new Error(
    '未找到 data/ 或 data.example/，请先运行 npm run setup 初始化数据目录。 / ' +
      'Neither data/ nor data.example/ exists; run `npm run setup` first.'
  );
}
