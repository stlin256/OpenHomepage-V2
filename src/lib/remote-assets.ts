/**
 * 远程媒体本地化（构建期下载）：把 http(s) 的图片/音视频下载到
 * <dataDir>/assets/remote/，返回 data/ 相对路径（assets/remote/<hash>.<ext>），
 * 供 RSS 封面（prefetch 后处理）与正文/streaming 渲染（markdown rehype 插件）复用。
 *
 * 设计要点：
 * - URL → 本地路径的映射持久化在 .cache/remote-assets.json：同一 URL 只下载一次，
 *   跨页面/跨语言/跨构建复用；失败不落盘，下次构建重试；
 * - 只在真实数据目录（data/）下启用：data.example/ 是入库示例数据，不向其中写文件
 *   （调用方拿到 null 后保留原远程 URL）；
 * - 下载产物随 astro.config.mjs 的 data-assets 集成进入 dist/assets，
 *   并经 scripts/optimize-images.ts 的 WebP/响应式管线处理；
 * - 网络层（fetchFn）/时钟（now）可注入，单测不发真实请求。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type RemoteFetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface RemoteAssetOptions {
  /** data 根目录（resolveDataDir 的结果）；basename 非 data（如 data.example）时直接返回 null */
  dataDir: string;
  /** 网络层注入点，缺省用全局 fetch */
  fetchFn?: RemoteFetchFn;
  /** 时钟注入点，缺省 Date.now */
  now?: () => number;
  /** 单请求超时，默认 15s */
  requestTimeoutMs?: number;
  /** 下载失败/跳过的告警（缺省 console.warn） */
  warn?: (msg: string) => void;
}

/** 映射文件条目：远程 URL → 已下载的本地资产 */
interface RemoteAssetEntry {
  /** data/ 相对路径（assets/remote/<hash>.<ext>） */
  path: string;
  fetched_at: number;
}

type RemoteAssetMap = Record<string, RemoteAssetEntry>;

const USER_AGENT = 'openhomepage-prefetch';
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

/** URL 路径后缀可信时直接使用；否则按响应 Content-Type 推断 */
const EXT_ALLOWLIST = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'ico',
  'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg', 'm4a', 'flac',
]);

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/flac': 'flac',
};

/** 远程 URL 的文件后缀：白名单内返回小写后缀，否则 null（交由 Content-Type 推断） */
export function extFromUrl(url: string): string | null {
  try {
    const ext = path.posix.extname(new URL(url).pathname).slice(1).toLowerCase();
    return EXT_ALLOWLIST.has(ext) ? ext : null;
  } catch {
    return null;
  }
}

function extFromContentType(contentType: string | null): string | null {
  if (!contentType) return null;
  const mime = contentType.split(';')[0].trim().toLowerCase();
  return MIME_TO_EXT[mime] ?? null;
}

/** URL → 稳定的本地相对路径（内容无关，按 URL 哈希命名，跨构建幂等） */
export function remoteAssetPath(url: string, ext: string): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 16);
  return `assets/remote/${hash}.${ext}`;
}

// ---------- 进程内缓存（构建/开发同进程内去重） ----------

/** dataDir → 已加载的映射（懒加载，写盘用原子 rename） */
const mapCache = new Map<string, RemoteAssetMap>();
/** URL → 进行中的下载 Promise：并发渲染同一 URL 只发一次请求 */
const inflight = new Map<string, Promise<string | null>>();
/** 已提示过 data.example 跳过的 dataDir（避免每页重复告警） */
const skippedDirs = new Set<string>();

function mapFileOf(dataDir: string): string {
  // .cache/ 与 data/ 同级的项目约定（prefetch 的 cacheDir 也是 <root>/.cache）
  return path.join(path.dirname(dataDir), '.cache', 'remote-assets.json');
}

function loadMap(dataDir: string): RemoteAssetMap {
  let map = mapCache.get(dataDir);
  if (map) return map;
  try {
    map = JSON.parse(readFileSync(mapFileOf(dataDir), 'utf8')) as RemoteAssetMap;
  } catch {
    map = {};
  }
  mapCache.set(dataDir, map);
  return map;
}

function saveMap(dataDir: string, map: RemoteAssetMap): void {
  const file = mapFileOf(dataDir);
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
}

async function download(
  url: string,
  opts: Required<Pick<RemoteAssetOptions, 'fetchFn' | 'now' | 'requestTimeoutMs' | 'warn'>> & { dataDir: string },
): Promise<string | null> {
  const resp = await opts.fetchFn(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'image/*,video/*,audio/*,*/*' },
    signal: AbortSignal.timeout(opts.requestTimeoutMs),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const ext = extFromUrl(url) ?? extFromContentType(resp.headers.get('content-type'));
  if (!ext) throw new Error('无法识别的文件类型（URL 无白名单后缀且 Content-Type 未知）');
  const rel = remoteAssetPath(url, ext);
  const file = path.join(opts.dataDir, rel);
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length === 0) throw new Error('响应体为空');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, buf);
  const map = loadMap(opts.dataDir);
  map[url] = { path: rel, fetched_at: opts.now() };
  saveMap(opts.dataDir, map);
  return rel;
}

/**
 * 把远程媒体 URL 本地化：命中映射且文件仍在 → 直接返回本地相对路径；
 * 否则下载（进程内并发去重）并记录映射。任何失败/不适用场景返回 null，
 * 调用方保留原 URL（不阻断构建）。
 */
export function localizeRemoteAsset(
  url: string,
  options: RemoteAssetOptions,
): Promise<string | null> {
  const { dataDir } = options;
  const warn = options.warn ?? console.warn;
  // 示例数据目录是入库内容，不写入；真实 data/（不入库）才落盘
  if (path.basename(dataDir) !== 'data') {
    if (!skippedDirs.has(dataDir)) {
      skippedDirs.add(dataDir);
      warn(
        `数据目录为 ${path.basename(dataDir)}/（非 data/），跳过远程资源下载：${url}。/` +
          ` Skipping remote asset download outside data/: ${url}`,
      );
    }
    return Promise.resolve(null);
  }
  const map = loadMap(dataDir);
  const hit = map[url];
  if (hit && existsSync(path.join(dataDir, hit.path))) {
    return Promise.resolve(hit.path);
  }
  const key = `${dataDir}${url}`;
  let p = inflight.get(key);
  if (!p) {
    p = download(url, {
      dataDir,
      fetchFn: options.fetchFn ?? (globalThis.fetch as unknown as RemoteFetchFn),
      now: options.now ?? (() => Date.now()),
      requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      warn,
    }).catch((e: Error) => {
      warn(
        `远程资源下载失败，保留原 URL：${url}（${e.message}）。/` +
          ` Failed to download ${url}: ${e.message}; keeping the remote URL.`,
      );
      return null;
    });
    inflight.set(key, p);
    // 成功后结果已进持久映射，可清除；失败保留本次 Promise，同一运行内不重复请求
    // （失败不落盘，下次构建仍会重试）
    void p.then((result) => {
      if (result !== null && inflight.get(key) === p) inflight.delete(key);
    });
  }
  return p;
}

/** 测试用：清空进程内缓存（映射/并发/告警去重状态） */
export function resetRemoteAssetState(): void {
  mapCache.clear();
  inflight.clear();
  skippedDirs.clear();
}
