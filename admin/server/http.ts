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
import { readSiteConfig, writeSiteConfig, readRssConfig, writeRssConfig, writeConfigField } from './configs.ts';
import { listAssets, saveAsset, readAsset, deleteAsset, MAX_ASSET_BYTES } from './assets.ts';
import { listSnapshots, restoreSnapshot } from './snapshots.ts';
import { historyState, undo as historyUndo, redo as historyRedo } from './history.ts';
import { safeResolve, PathError } from './paths.ts';
import { createDevServerManager, type DevServerManager } from './devserver.ts';
import { listPageBlocks, applyBlockOp, HashConflictError } from './blocks.ts';
import { readStreamContent, writeStreamContent, NotFoundError } from './stream.ts';
import { buildZip, collectDataEntries, exportZipName } from './export.ts';
import { importDataZip, previewBibtexImport, mergeBibtexImport } from './import.ts';
import { shouldShowOnboarding, markOnboardingDone } from './onboarding.ts';
import {
  listLanguageState,
  archiveLanguage,
  restoreLanguage,
  LangConflictError,
} from './languages.ts';
import {
  fetchGithubProfile,
  GithubPrefillError,
  GITHUB_USERNAME_RE,
} from './github-prefill.ts';
import { syncGithubAvatar } from './github-avatar.ts';
import { convertFavicon, saveFavicon } from './favicon.ts';
import { readDeployInfo } from './deploy-info.ts';
import { pageUrlPath, normalizeLang } from '../../src/lib/routes.ts';
import { renderMarkdown } from '../../src/lib/markdown.ts';
import { getBaseUrl } from '../../src/lib/base-url.ts';

const ADMIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC_DIR = path.join(ADMIN_DIR, 'public');
/** 可视化编辑 overlay 样式（admin/ui/overlay/overlay.css，随请求读取） */
const OVERLAY_CSS = path.join(ADMIN_DIR, 'ui', 'overlay', 'overlay.css');

/** overlay 跑在 dev server origin，跨域调 admin API：仅放行回环 origin（纯本地工具，spec 12 §2.4） */
const LOOPBACK_ORIGIN_RE = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+$/;

export interface AdminServerOptions {
  dataDir: string;
  /** 本次启动是否从 data.example/ 自动初始化（界面提示用） */
  initialized: boolean;
  /** 打包后的前端 JS（启动时由 esbuild 产物注入） */
  appJs: string;
  /** 打包后的可视化编辑 overlay JS（admin/ui/overlay/main.ts 的 esbuild 产物；缺省返回空脚本） */
  overlayJs?: string;
  /** 项目根目录（spawn astro dev 用；缺省取 dataDir 的上一级） */
  rootDir?: string;
  /** dev server 管理器（测试可注入替身） */
  devManager?: DevServerManager;
  /** GitHub 预填的 fetch 实现（测试可注入替身；缺省用全局 fetch） */
  githubFetch?: typeof fetch;
  /** GitHub 预填请求超时毫秒数（测试可注入；缺省 5000） */
  githubTimeoutMs?: number;
}

type Json = Record<string, unknown>;
type Handler = (ctx: {
  query: URLSearchParams;
  body: Json;
  raw: Buffer;
  res: http.ServerResponse;
}) => void | Promise<void>;

const MAX_JSON_BYTES = 5 * 1024 * 1024;
/** 预览渲染（POST /api/render-markdown，M12g）的 markdown 上限：256KB（防滥用） */
const MAX_RENDER_MARKDOWN_BYTES = 256 * 1024;

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
  const status =
    e instanceof PathError
      ? 400
      : e instanceof NotFoundError
        ? 404
        : e instanceof HashConflictError
          ? 409
          : e instanceof LangConflictError
            ? 409
            : e instanceof GithubPrefillError
            ? e.status
            : /不存在|非法|缺少|必须|已存在|不能|不支持|过大|超限|not found/i.test(msg)
              ? 400
              : 500;
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
      // 新手向导（spec 19）：仅首次初始化（initialized）且未完成标记时自动弹出；实时查标记文件
      '/api/onboarding': ({ res }) =>
        sendJson(res, 200, { show: shouldShowOnboarding(dataDir, opts.initialized) }),
      // 新手向导第 1 步「自动同步信息」（spec 19 §3.1）：GitHub 公开资料预填；
      // 用户名非法 400，用户不存在 404，网络失败/超时 502（GithubPrefillError 经 sendError 映射）
      '/api/github/prefill': async ({ query, res }) => {
        const username = (query.get('username') ?? '').trim();
        if (!GITHUB_USERNAME_RE.test(username)) {
          sendJson(res, 400, { error: '非法的 GitHub 用户名 / Invalid GitHub username' });
          return;
        }
        sendJson(
          res,
          200,
          await fetchGithubProfile(username, opts.githubFetch ?? fetch, opts.githubTimeoutMs)
        );
      },
      // 部署引导（spec 22）：git remote origin → GitHub 仓库 Secrets/Actions deep link；
      // 读不到（非 git 仓库/非 GitHub 托管）时字段为 null，前端降级为手填仓库地址
      '/api/deploy-info': ({ res }) =>
        sendJson(res, 200, readDeployInfo(opts.rootDir ?? path.resolve(dataDir, '..'))),
      // M12d：每页附 previewPath（overlay 顶栏页面切换下拉的跳转目标）
      '/api/pages': ({ res }) =>
        sendJson(res, 200, {
          pages: listPages(dataDir).map((p) => ({
            ...p,
            previewPath: previewPathFor(dataDir, p.lang, p.file, { slug: p.slug }),
          })),
        }),
      '/api/page': ({ query, res }) => {
        const lang = query.get('lang') ?? '';
        const file = query.get('file') ?? '';
        const content = readPage(dataDir, lang, file);
        sendJson(res, 200, { ...content, previewPath: previewPathFor(dataDir, lang, file, content.frontmatter) });
      },
      '/api/config/site': ({ res }) => sendJson(res, 200, { data: readSiteConfig(dataDir) }),
      '/api/config/rss': ({ res }) => sendJson(res, 200, { data: readRssConfig(dataDir) }),
      // 语言管理（spec 19 §4）：当前启用/已归档语言列表、默认语言、en 是否在列、当前语言数
      '/api/languages': ({ res }) => sendJson(res, 200, listLanguageState(dataDir)),
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
      // 撤销/重做（快照兜底，history.ts）：path 可省略——缺省操作本进程最近写盘文件
      '/api/history': ({ query, res }) =>
        sendJson(res, 200, historyState(dataDir, query.get('path') || undefined)),
      '/api/dev-status': async ({ res }) => sendJson(res, 200, await dev.status()),
      // 可视化编辑（M12a）：页面正文可编辑块清单（坐标 + 内容 hash，供 overlay 陈旧检测）
      '/api/page/blocks': ({ query, res }) =>
        sendJson(res, 200, { blocks: listPageBlocks(dataDir, query.get('path') ?? '') }),
      // 可视化编辑（M12g）：流式块内容文件读取（overlay 编辑窗口初值；
      // lang 缺省用站点默认语言，回退链与渲染端一致）
      '/api/stream-content': ({ query, res }) =>
        sendJson(
          res,
          200,
          readStreamContent(dataDir, query.get('id') ?? '', normalizeLang(query.get('lang') ?? ''))
        ),
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
      // 新手向导（spec 19）：完成或跳过即写 data/.onboarding-done 标记，不再自动弹出
      '/api/onboarding/done': ({ res }) => {
        markOnboardingDone(dataDir);
        sendJson(res, 200, { ok: true });
      },
      // 语言管理（spec 19 §4）：停用=归档到 data/.archived_langs/（默认语言 400 拒绝；
      // 归档后剩余 <2 语言需 confirm:true 否则 409；归档目标已存在 409；en 归档响应带
      // warnings:['en-fallback']）；恢复反向移回（归档不存在 400、目标已存在 409）
      '/api/languages/archive': ({ body, res }) =>
        sendJson(
          res,
          200,
          archiveLanguage(dataDir, String(body.lang ?? ''), body.confirm === true)
        ),
      '/api/languages/restore': ({ body, res }) =>
        sendJson(res, 200, restoreLanguage(dataDir, String(body.lang ?? ''))),
      // 新手向导第 1 步「同步头像」（spec 19 §3.2）：下载 GitHub 头像落盘 data/assets/
      // 并写回 site.yaml 的 profile.avatar（schema 校验 + 快照）；用户名非法 400，
      // 用户不存在 404，网络失败/超时/超限/非 PNG/JPEG 一律 502（GithubAvatarError
      // 继承 GithubPrefillError，经 sendError 同一映射），失败不落盘半成品
      '/api/github/avatar': async ({ body, res }) => {
        const username = String(body.username ?? '').trim();
        if (!GITHUB_USERNAME_RE.test(username)) {
          sendJson(res, 400, { error: '非法的 GitHub 用户名 / Invalid GitHub username' });
          return;
        }
        sendJson(
          res,
          200,
          await syncGithubAvatar(dataDir, username, opts.githubFetch ?? fetch, opts.githubTimeoutMs)
        );
      },
      // 可视化编辑（M12a）：单块 replace/insert/delete/move（hash 防陈旧写 + 快照 + 落盘）
      '/api/page/block': ({ body, res }) => sendJson(res, 200, applyBlockOp(dataDir, body)),
      // 可视化编辑（M12d）：单字段写回（就地改字；路径校验 + schema 校验 + 快照）
      '/api/config/field': ({ body, res }) => sendJson(res, 200, writeConfigField(dataDir, body)),
      // 可视化编辑（M12g）：流式块内容写回（快照 + 撤销链在 admin/server/stream.ts）
      '/api/stream-content': ({ body, res }) =>
        sendJson(res, 200, writeStreamContent(dataDir, body)),
      // 可视化编辑（M12g）：编辑窗口的预览渲染（站点同一条 markdown 管线；上限 256KB → 413。
      // 已知限制：stream/ghcard/editorial 嵌入占位在预览缺数据时被移除，预览用于文本/排版/媒体核对）
      '/api/render-markdown': async ({ body, res }) => {
        const markdown = body.markdown;
        if (typeof markdown !== 'string') throw new Error('非法的内容：markdown 必须是字符串');
        if (Buffer.byteLength(markdown, 'utf8') > MAX_RENDER_MARKDOWN_BYTES) {
          sendJson(res, 413, {
            error: 'markdown 过大（上限 256KB）/ Markdown too large (256KB max)',
          });
          return;
        }
        sendJson(res, 200, { html: await renderMarkdown(markdown, { baseUrl: getBaseUrl() }) });
      },
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
      // 撤销/重做：无可撤销/重做时不报错，返回 { ok:false, canUndo, canRedo }
      '/api/history/undo': ({ body, res }) =>
        sendJson(res, 200, historyUndo(dataDir, typeof body.path === 'string' && body.path !== '' ? body.path : undefined)),
      '/api/history/redo': ({ body, res }) =>
        sendJson(res, 200, historyRedo(dataDir, typeof body.path === 'string' && body.path !== '' ? body.path : undefined)),
      '/api/dev/start': async ({ res }) => sendJson(res, 200, await dev.start()),
      '/api/dev/stop': async ({ res }) => sendJson(res, 200, await dev.stop()),
      // favicon 上传：原始二进制图片 → 居中裁方 → 180/32 PNG 入 assets + 写回 site.favicon
      '/api/favicon': async ({ raw, res }) => {
        const outputs = await convertFavicon(raw);
        sendJson(res, 200, saveFavicon(dataDir, outputs));
      },
      // data.zip 导入（spec 18）：整包备份当前 data/ → 路径校验 → 覆盖写入，返回文件数与备份路径
      '/api/import-data': ({ raw, res }) => sendJson(res, 200, importDataZip(dataDir, raw)),
      // BibTeX 导入（spec 18）：预览（解析 + 映射 + 去重，不写盘）与确认合并（快照 + 落盘）
      '/api/import/bibtex/preview': ({ body, res }) => {
        const bibtex = body.bibtex;
        if (typeof bibtex !== 'string') throw new Error('非法的内容：bibtex 必须是字符串');
        const { added, skipped } = previewBibtexImport(dataDir, bibtex);
        sendJson(res, 200, { added, skipped });
      },
      '/api/import/bibtex': ({ body, res }) => {
        const bibtex = body.bibtex;
        if (typeof bibtex !== 'string') throw new Error('非法的内容：bibtex 必须是字符串');
        sendJson(res, 200, mergeBibtexImport(dataDir, bibtex));
      },
    },
  };

  return http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      // CORS（M12a）：overlay 跑在 dev server origin 调 /api/*；仅回环 origin 回显，预检 204
      const origin = req.headers.origin ?? '';
      const corsOrigin = LOOPBACK_ORIGIN_RE.test(origin) ? origin : null;
      if (url.pathname.startsWith('/api/')) {
        if (corsOrigin) {
          res.setHeader('Access-Control-Allow-Origin', corsOrigin);
          res.setHeader('Vary', 'Origin');
        }
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'content-type',
            'Access-Control-Max-Age': '600',
          });
          res.end();
          return;
        }
      }
      const handler = routes[req.method ?? '']?.[url.pathname];
      if (handler) {
        // 原始二进制上传（素材 / favicon 图片 / data.zip 导入）；其余按 JSON 解析
        const isUpload =
          url.pathname === '/api/asset' ||
          url.pathname === '/api/favicon' ||
          url.pathname === '/api/import-data';
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
        serveStatic(url.pathname, res, opts);
        return;
      }
      sendJson(res, 404, { error: '接口不存在 / Not found' });
    })().catch((e) => {
      if (!res.headersSent) sendError(res, e);
      else res.end();
    });
  });
}

function serveStatic(pathname: string, res: http.ServerResponse, opts: AdminServerOptions): void {
  if (pathname === '/' || pathname === '/index.html') {
    const html = readFileSync(path.join(STATIC_DIR, 'index.html'), 'utf8');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  if (pathname === '/app.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    res.end(opts.appJs);
    return;
  }
  // 可视化编辑 overlay（M12a）：dev server 页面 bootstrap 从本 origin 动态加载
  if (pathname === '/overlay.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    res.end(opts.overlayJs ?? '');
    return;
  }
  if (pathname === '/overlay.css') {
    res.writeHead(200, { 'content-type': 'text/css; charset=utf-8' });
    res.end(readFileSync(OVERLAY_CSS, 'utf8'));
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
