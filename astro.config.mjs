import { defineConfig } from 'astro/config';
import { cpSync, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 站点 URL 占位，部署前替换为真实域名
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
          res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
          res.end(readFileSync(file));
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

export default defineConfig({
  output: 'static',
  site: 'https://example.com',
  integrations: [dataAssets()],
});
