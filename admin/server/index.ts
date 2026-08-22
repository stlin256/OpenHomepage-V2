/**
 * 编辑器入口（npm run admin）：
 * 1. 确保 data/ 存在（缺失时自动从 data.example/ 初始化并提示）；
 * 2. esbuild 内存打包前端 SPA（admin/ui/main.ts → 单文件 ESM）；
 * 3. 原生 http 服务，仅监听 127.0.0.1:4174。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { ensureDataDir } from './setup.ts';
import { createAdminServer } from './http.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const { dataDir, initialized } = ensureDataDir(root);
if (initialized) {
  console.log('已从 data.example/ 初始化 data/。/ Initialized data/ from data.example/.');
}

const bundle = await build({
  entryPoints: [path.join(root, 'admin/ui/main.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  write: false,
  logLevel: 'warning',
});
const appJs = bundle.outputFiles[0].text;

const port = Number(process.env.ADMIN_PORT ?? 4174);
const server = createAdminServer({ dataDir, initialized, appJs });
server.listen(port, '127.0.0.1', () => {
  console.log(`编辑器已启动 / Editor running:  http://127.0.0.1:${port}`);
  console.log('仅监听本机回环地址 / Listening on loopback only.');
});
