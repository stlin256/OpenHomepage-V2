import { defineConfig } from 'astro/config';
import { cpSync, createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  // 音频（背景音乐等，spec 01 bgm 段）
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

/**
 * data/assets 静态资源（头像等）：build 时拷入 dist/assets，dev 时由中间件提供。
 * 与 src/lib/data-dir.ts 同样的回退规则：data/ 缺失时用 data.example/。
 *
 * 可视化编辑配套（M12f）：admin 写 data/（页面/配置/快照）后，Astro dev 的路由缓存
 * （getStaticPaths 结果，含正文 body）不会自动失效——data/ 不在 vite 模块图中，
 * 模块身份不变即直接返回缓存，overlay 保存后整页刷新仍是旧内容（插入的块"消失"）。
 * 这里监听 data/ 变更并失效 src/pages 路由模块（仅路由组件重新求值，依赖模块缓存不动，
 * 开销可忽略），强制下次请求重跑 getStaticPaths 读到最新文件。
 */
function dataAssets() {
  const srcDir = () => {
    for (const d of ['data/assets', 'data.example/assets']) {
      if (existsSync(d)) return path.resolve(d);
    }
    return null;
  };
  return {
    name: 'data-assets',
    hooks: {
      'astro:server:setup'({ server }) {
        server.watcher.on('change', (file) => {
          if (!/[/\\]data(\.example)?[/\\]/.test(file)) return;
          for (const mod of server.moduleGraph.idToModuleMap.values()) {
            if (mod.file && /[/\\]src[/\\]pages[/\\].+\.astro$/.test(mod.file)) {
              server.moduleGraph.invalidateModule(mod);
            }
          }
        });
        server.middlewares.use('/assets', (req, res, next) => {
          const dir = srcDir();
          if (!dir) return next();
          const rel = decodeURIComponent((req.url ?? '/').split('?')[0]);
          const file = path.join(dir, path.normalize(rel));
          if (!file.startsWith(dir + path.sep) || !existsSync(file) || !statSync(file).isFile()) {
            return next();
          }
          const size = statSync(file).size;
          const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
          const range = req.headers.range;
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Content-Type', type);
          if (!range) {
            res.setHeader('Content-Length', String(size));
            if (req.method === 'HEAD') return res.end();
            createReadStream(file).pipe(res);
            return;
          }
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (!match) {
            res.writeHead(416, { 'Content-Range': `bytes */${size}` });
            return res.end();
          }
          const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2] || 0));
          const end = match[2] ? Number(match[2]) : size - 1;
          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
            res.writeHead(416, { 'Content-Range': `bytes */${size}` });
            return res.end();
          }
          const boundedEnd = Math.min(end, size - 1);
          res.writeHead(206, {
            'Accept-Ranges': 'bytes',
            'Content-Range': `bytes ${start}-${boundedEnd}/${size}`,
            'Content-Length': String(boundedEnd - start + 1),
            'Content-Type': type,
          });
          if (req.method === 'HEAD') return res.end();
          createReadStream(file, { start, end: boundedEnd }).pipe(res);
        });
      },
      'astro:build:done'({ dir }) {
        const src = srcDir();
        if (!src) return;
        cpSync(src, path.join(fileURLToPath(dir), 'assets'), { recursive: true });
      },
    },
  };
}

const base = process.env.ASTRO_BASE || (process.env.GITHUB_ACTIONS && process.env.GITHUB_REPOSITORY ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}` : undefined);

export default defineConfig({
  output: 'static',
  site: 'https://stlin256.github.io',
  base,
  integrations: [dataAssets()],
});