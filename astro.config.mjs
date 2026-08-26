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