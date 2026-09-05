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
import { createDevServerManager } from './devserver.ts';
import { createBuildManager } from './build.ts';
import { createPreviewManager } from './preview.ts';
import { renderMarkdown } from '../../src/lib/markdown.ts';
import { getBaseUrl } from '../../src/lib/base-url.ts';

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

// 可视化编辑 overlay（M12a）：独立打包为经典脚本（IIFE），由 dev server 页面 bootstrap
// 跨 origin 以普通 <script> 加载（module 脚本会受 CORS 限制，IIFE 不需要）
const overlayBundle = await build({
  entryPoints: [path.join(root, 'admin/ui/overlay/main.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  write: false,
  logLevel: 'warning',
});
const overlayJs = overlayBundle.outputFiles[0].text;

const port = Number(process.env.ADMIN_PORT ?? 4174);
const adminOrigin = `http://127.0.0.1:${port}`;
const devManager = createDevServerManager({ rootDir: root, adminOrigin });
// 发布视图（spec 21）：构建状态机与 dist 静态预览（admin 退出时一并清理，见 shutdown）
const buildManager = createBuildManager({ rootDir: root });
const previewManager = createPreviewManager({ rootDir: root });
const server = createAdminServer({
  dataDir,
  initialized,
  appJs,
  overlayJs,
  rootDir: root,
  devManager,
  buildManager,
  previewManager,
});
// 预热 Markdown 渲染管线（Shiki/WASM/主题），消除首次打开预览窗口或编辑时的冷启动延迟
void renderMarkdown('```js\nwarmup\n```', { baseUrl: getBaseUrl() }).catch(() => {});

server.listen(port, '127.0.0.1', () => {
  console.log(`编辑器已启动 / Editor running:  http://127.0.0.1:${port}`);
  console.log('仅监听本机回环地址 / Listening on loopback only.');
});

// 一键全启动（批次 5）：编辑器启动时自动拉起预览 dev server——已在跑则探测接管不重复
// spawn（devserver.start 幂等）；端口被占用时 astro dev 自动递增，真实 URL 从日志解析；
// admin 退出（SIGINT/SIGTERM）连带停止它 spawn 的子进程（见下方 shutdown）。
void devManager.start().then(async () => {
  // 给 astro dev 一点就绪时间再探测打印 URL（失败不致命，界面指示灯会持续轮询）
  for (let i = 0; i < 30; i++) {
    const s = await devManager.status();
    if (s.up && s.url) {
      console.log(`预览服务已就绪 / Preview ready:  ${s.url}`);
      return;
    }
    if (s.error) {
      console.warn(`预览服务启动失败 / Preview failed: ${s.error}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
});

// admin 退出时连带终止由它 spawn 的 astro dev（Windows 走 taskkill /T 树杀，见 devserver.ts）、
// 取消进行中的构建并关闭 dist 预览服务（spec 21）
let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  void Promise.allSettled([devManager.stop(), buildManager.stop(), previewManager.stop()]).finally(
    () => {
      server.close();
      process.exit(0);
    }
  );
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
