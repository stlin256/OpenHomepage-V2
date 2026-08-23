/**
 * `npm run serve`：自部署静态服务器，直出 dist/（多页静态，无 SPA 回退）。
 * - SSL：site.yaml serve.ssl 显式配置，或项目根 certs/cert.pem + key.pem 约定自动启用；
 *   证书缺失/无效（解析失败、密钥不匹配）→ 中文警告并降级 HTTP；过期仅警告。
 * - 决策逻辑全部在 scripts/serve-lib.ts（纯函数，有单测）。
 */
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { load as loadYaml } from 'js-yaml';
import { resolveDataDir } from '../src/lib/data-dir.ts';
import { planServe, resolveStaticPath, SERVE_MIME, type ServeIO, type ServePlan } from './serve-lib.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');

export const io: ServeIO = {
  exists: (p) => existsSync(p),
  read: (p) => readFileSync(p, 'utf8'),
  kind: (p) => {
    try {
      const s = statSync(p);
      return s.isFile() ? 'file' : s.isDirectory() ? 'dir' : null;
    } catch {
      return null;
    }
  },
};

/** dist/ 静态服务（GET/HEAD；目录索引 index.html；404.html 兜底；防穿越） */
export function createStaticServer(plan: ServePlan, dist: string = distDir): http.Server | https.Server {
  const handler = (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    const file = resolveStaticPath(dist, pathname, io);
    if (!file) {
      const notFound = resolveStaticPath(dist, '/404.html', io);
      if (notFound) {
        const body = readFileSync(notFound);
        res.writeHead(404, { 'content-type': SERVE_MIME['.html'], 'content-length': body.byteLength });
        res.end(req.method === 'HEAD' ? undefined : body);
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const size = statSync(file).size;
    const type = SERVE_MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    const isHtml = file.endsWith('.html');
    // Astro 产物（/_astro/ 下文件名带 hash）可长缓存；HTML 每次校验
    const cache = isHtml
      ? 'no-cache'
      : file.includes(`${path.sep}_astro${path.sep}`)
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600';
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` });
        res.end();
        return;
      }
      const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2] || 0));
      const end = match[2] ? Number(match[2]) : size - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` });
        res.end();
        return;
      }
      const boundedEnd = Math.min(end, size - 1);
      res.writeHead(206, {
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${boundedEnd}/${size}`,
        'Content-Length': boundedEnd - start + 1,
        'Content-Type': type,
        'Cache-Control': cache,
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      createReadStream(file, { start, end: boundedEnd }).pipe(res);
      return;
    }
    const body = readFileSync(file);
    res.writeHead(200, {
      'content-type': type,
      'accept-ranges': 'bytes',
      'content-length': body.byteLength,
      'cache-control': cache,
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  };
  return plan.secure && plan.cert && plan.key
    ? https.createServer({ cert: plan.cert, key: plan.key }, handler)
    : http.createServer(handler);
}

function main(): void {
  if (!existsSync(distDir)) {
    console.error('dist/ 不存在，请先运行 npm run build。/ dist/ not found; run `npm run build` first.');
    process.exit(1);
  }
  let siteRaw: unknown = null;
  try {
    const dataDir = resolveDataDir(rootDir, (m) => console.warn(m));
    siteRaw = loadYaml(readFileSync(path.join(dataDir, 'site.yaml'), 'utf8'));
  } catch (e) {
    console.warn(`读取 site.yaml 失败（${(e as Error).message}），serve 配置按缺省处理。`);
  }
  const plan = planServe(rootDir, siteRaw, io);
  for (const w of plan.warnings) console.warn(`警告：${w}`);
  const server = createStaticServer(plan, distDir);
  server.listen(plan.port, () => {
    const scheme = plan.secure ? 'https' : 'http';
    console.log(`静态服务已启动 / Serving dist/:  ${scheme}://localhost:${plan.port}`);
    if (plan.secure) console.log('自签名证书会让浏览器提示不受信任，确认后继续即可。');
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
