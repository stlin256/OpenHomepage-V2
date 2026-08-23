/**
 * 编辑器 HTTP 服务：原生 node:http 实现（零新增依赖，离线可用）。
 * 仅监听 127.0.0.1；REST 直写 data/ 文件；静态托管 SPA。
 */
import http from 'node:http';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  listPages,
  readPage,
  writePage,
  createPage,
  renamePage,
  deletePage,
} from './pages.ts';
import { readSiteConfig, writeSiteConfig, readRssConfig, writeRssConfig } from './configs.ts';
import { listAssets, saveAsset, readAsset, deleteAsset, MAX_ASSET_BYTES } from './assets.ts';
import { listSnapshots, restoreSnapshot } from './snapshots.ts';
import { safeResolve, PathError } from './paths.ts';
import { createDevServerManager, type DevServerManager } from './devserver.ts';
import { readDirectivePreview } from './directive-preview.ts';
import { buildZip, collectDataEntries, exportZipName } from './export.ts';
import { convertFavicon, saveFavicon } from './favicon.ts';
import { pageUrlPath, normalizeLang } from '../../src/lib/routes.ts';

const ADMIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC_DIR = path.join(ADMIN_DIR, 'public');

export interface AdminServerOptions {
  dataDir: string;
  /** 本次启动是否从 data.example/ 自动初始化（界面提示用） */
  initialized: boolean;
  /** 打包后的前端 JS（启动时由 esbuild 产物注入） */
  appJs: string;
  /** 项目根目录（spawn astro dev 用；缺省取 dataDir 的上一级） */
  rootDir?: string;
  /** dev server 管理器（测试可注入替身） */
  devManager?: DevServerManager;
}

type Json = Record<string, unknown>;
type Handler = (ctx: {
  query: URLSearchParams;
  body: Json;
  raw: Buffer;
  res: http.ServerResponse;
}) => void | Promise<void>;

const MAX_JSON_BYTES = 5 * 1024 * 1024;

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
};

function readBody(req: http.IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.byteLength;
      if (size > limit) {
        reject(new Error('请求体过大 / Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  const text = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(text);
}

function sendError(res: http.ServerResponse, e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e);
  const status = e instanceof PathError ? 400 : /不存在|非法|缺少|必须|已存在|不能|不支持|过大|超限|not found/i.test(msg) ? 400 : 500;
  sendJson(res, status, { error: msg });
}

/** 页面在 dev server 上的预览路径（默认语言无前缀，与 src/lib/routes.ts + [...slug].astro 规则一致） */
function previewPathFor(
  dataDir: string,
  lang: string,
  file: string,
  fm: Record<string, unknown>
): string {
  const base = file.replace(/\.md$/, '');
  const slug = (fm.slug as string | undefined) ?? (base === 'index' ? '/' : base);
  const langs = [...new Set(listPages(dataDir).map((p) => p.lang))].sort();
  let defaultLang = langs[0] ?? lang;
  try {
    const siteLang = normalizeLang(readSiteConfig(dataDir).site?.language);
    if (siteLang) defaultLang = langs.includes(siteLang) ? siteLang : defaultLang;
  } catch {
    /* 配置读不出时用语言目录兜底 */
  }
  return pageUrlPath(slug, lang, defaultLang);
}

export function createAdminServer(opts: AdminServerOptions): http.Server {
  const { dataDir } = opts;
  const dev =
    opts.devManager ??
    createDevServerManager({ rootDir: opts.rootDir ?? path.resolve(dataDir, '..') });

  const routes: Record<string, Record<string, Handler>> = {
    GET: {
      '/api/info': ({ res }) =>
        sendJson(res, 200, { initialized: opts.initialized, dataDir: path.basename(dataDir) }),
      '/api/pages': ({ res }) => sendJson(res, 200, { pages: listPages(dataDir) }),
      '/api/page': ({ query, res }) => {
        const lang = query.get('lang') ?? '';
        const file = query.get('file') ?? '';
        const content = readPage(dataDir, lang, file);
        sendJson(res, 200, { ...content, previewPath: previewPathFor(dataDir, lang, file, content.frontmatter) });
      },
      '/api/config/site': ({ res }) => sendJson(res, 200, { data: readSiteConfig(dataDir) }),
      '/api/config/rss': ({ res }) => sendJson(res, 200, { data: readRssConfig(dataDir) }),
      '/api/assets': ({ res }) => sendJson(res, 200, { assets: listAssets(dataDir) }),
      '/api/asset/file': ({ query, res }) => {
        const name = query.get('name') ?? '';
        const buf = readAsset(dataDir, name);
        res.writeHead(200, {
          'content-type': MIME[path.extname(name).toLowerCase()] ?? 'application/octet-stream',
          'cache-control': 'no-cache',
        });
        res.end(buf);
      },
      '/api/snapshots': ({ query, res }) => {
        const rel = query.get('path') ?? '';
        safeResolve(dataDir, rel);
        sendJson(res, 200, { snapshots: listSnapshots(dataDir, rel) });
      },
      '/api/dev-status': async ({ res }) => sendJson(res, 200, await dev.status()),
      // 指令卡片预览数据（::ghcard 用 pinned 缓存，::stream 用流式块摘要）
      '/api/directive-preview': ({ res }) =>
        sendJson(res, 200, readDirectivePreview(opts.rootDir ?? path.resolve(dataDir, '..'), dataDir)),
      // 导出 data/ 全量 zip（含 .snapshots/ 版本快照）
      '/api/export-data': ({ res }) => {
        const zip = buildZip(collectDataEntries(dataDir));
        res.writeHead(200, {
          'content-type': 'application/zip',
          'content-disposition': `attachment; filename="${exportZipName()}"`,
          'content-length': zip.byteLength,
        });
        res.end(zip);
      },
    },
    PUT: {
      '/api/page': ({ body, res }) => {
        writePage(
          dataDir,
          String(body.lang ?? ''),
          String(body.file ?? ''),
          (body.frontmatter ?? {}) as Record<string, unknown>,
          String(body.body ?? '')
        );
        sendJson(res, 200, { ok: true });
      },
      '/api/config/site': ({ body, res }) => {
        writeSiteConfig(dataDir, body.data as never);
        sendJson(res, 200, { ok: true });
      },
      '/api/config/rss': ({ body, res }) => {
        writeRssConfig(dataDir, body.data as never);
        sendJson(res, 200, { ok: true });
      },
    },
    POST: {
      '/api/page/create': ({ body, res }) => {
        const r = createPage(
          dataDir,
          String(body.lang ?? ''),
          String(body.title ?? ''),
          body.slug ? String(body.slug) : undefined,
          typeof body.templateBody === 'string' ? body.templateBody : undefined
        );
        sendJson(res, 200, r);
      },
      '/api/page/rename': ({ body, res }) => {
        renamePage(dataDir, String(body.lang ?? ''), String(body.file ?? ''), String(body.newFile ?? ''));
        sendJson(res, 200, { ok: true });
      },
      '/api/page/delete': ({ body, res }) => {
        deletePage(dataDir, String(body.lang ?? ''), String(body.file ?? ''));
        sendJson(res, 200, { ok: true });
      },
      '/api/asset': async ({ query, raw, res }) => {
        const r = saveAsset(dataDir, query.get('name') ?? '', raw);
        sendJson(res, 200, r);
      },
      '/api/asset/delete': ({ body, res }) => {
        deleteAsset(dataDir, String(body.name ?? ''));
        sendJson(res, 200, { ok: true });
      },
      '/api/snapshot/restore': ({ body, res }) => {
        const rel = String(body.path ?? '');
        safeResolve(dataDir, rel);
        restoreSnapshot(dataDir, rel, String(body.ts ?? ''));
        sendJson(res, 200, { ok: true });
      },
      '/api/dev/start': async ({ res }) => sendJson(res, 200, await dev.start()),
      '/api/dev/stop': async ({ res }) => sendJson(res, 200, await dev.stop()),
      // favicon 上传：原始二进制图片 → 居中裁方 → 180/32 PNG 入 assets + 写回 site.favicon
      '/api/favicon': async ({ raw, res }) => {
        const outputs = await convertFavicon(raw);
        sendJson(res, 200, saveFavicon(dataDir, outputs));
      },
    },
  };

  return http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const handler = routes[req.method ?? '']?.[url.pathname];
      if (handler) {
        // 原始二进制上传（素材 / favicon 图片）；其余按 JSON 解析
        const isUpload = url.pathname === '/api/asset' || url.pathname === '/api/favicon';
        const raw = await readBody(req, isUpload ? MAX_ASSET_BYTES + 1024 : MAX_JSON_BYTES);
        let body: Json = {};
        if (!isUpload && raw.byteLength > 0) {
          try {
            body = JSON.parse(raw.toString('utf8')) as Json;
          } catch {
            sendJson(res, 400, { error: '请求体不是合法 JSON / Invalid JSON body' });
            return;
          }
        }
        await handler({ query: url.searchParams, body, raw, res });
        return;
      }
      if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
        serveStatic(url.pathname, res, opts.appJs);
        return;
      }
      sendJson(res, 404, { error: '接口不存在 / Not found' });
    })().catch((e) => {
      if (!res.headersSent) sendError(res, e);
      else res.end();
    });
  });
}

function serveStatic(pathname: string, res: http.ServerResponse, appJs: string): void {
  if (pathname === '/' || pathname === '/index.html') {
    const html = readFileSync(path.join(STATIC_DIR, 'index.html'), 'utf8');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  if (pathname === '/app.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    res.end(appJs);
    return;
  }
  if (pathname === '/styles.css') {
    const css = readFileSync(path.join(STATIC_DIR, 'styles.css'), 'utf8');
    res.writeHead(200, { 'content-type': 'text/css; charset=utf-8' });
    res.end(css);
    return;
  }
  const abs = safeResolve(STATIC_DIR, pathname.replace(/^\//, ''));
  if (existsSync(abs)) {
    res.writeHead(200, { 'content-type': MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream' });
    res.end(readFileSync(abs));
    return;
  }
  sendJson(res, 404, { error: 'Not found' });
}
