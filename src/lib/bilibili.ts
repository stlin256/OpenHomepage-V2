/**
 * Bilibili 视频元数据与封面解析（docs/specs/03）：
 * 根据 bvid 调用 Bilibili Web API 获取视频标题与高清封面 URL，
 * 并持久化在 .cache/bilibili.json 中，避免构建时重复请求。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface BilibiliMeta {
  bvid: string;
  title: string;
  pic: string;
  fetched_at: number;
}

export type BilibiliMetaMap = Record<string, BilibiliMeta>;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DEFAULT_TIMEOUT_MS = 10_000;

const memoryCache = new Map<string, BilibiliMetaMap>();
const inflight = new Map<string, Promise<BilibiliMeta | null>>();

function cacheFileOf(cacheDir?: string): string {
  return path.join(cacheDir ?? path.resolve('.cache'), 'bilibili.json');
}

export function loadBilibiliCache(cacheDir?: string): BilibiliMetaMap {
  const file = cacheFileOf(cacheDir);
  let map = memoryCache.get(file);
  if (map) return map;
  try {
    if (existsSync(file)) {
      map = JSON.parse(readFileSync(file, 'utf8')) as BilibiliMetaMap;
    } else {
      map = {};
    }
  } catch {
    map = {};
  }
  memoryCache.set(file, map);
  return map;
}

export function saveBilibiliCache(map: BilibiliMetaMap, cacheDir?: string): void {
  const file = cacheFileOf(cacheDir);
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
  memoryCache.set(file, map);
}

export interface FetchBilibiliOptions {
  cacheDir?: string;
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  now?: () => number;
  timeoutMs?: number;
  warn?: (msg: string) => void;
}

/**
 * 获取单个 BVID 的元数据（标题 + 封面图 URL）。
 * 优先读缓存；未命中时发起请求，成功后写入缓存；网络失败回退 null，不阻断构建。
 */
export async function fetchBilibiliMeta(
  bvid: string,
  options: FetchBilibiliOptions = {},
): Promise<BilibiliMeta | null> {
  const { cacheDir, timeoutMs = DEFAULT_TIMEOUT_MS, warn = console.warn } = options;
  const now = options.now ?? (() => Date.now());
  const fetchFn = options.fetchFn ?? (globalThis.fetch as typeof fetch);

  let cleanBvid = bvid.trim();
  if (!cleanBvid) return null;
  if (cleanBvid.startsWith('bv')) {
    cleanBvid = 'BV' + cleanBvid.slice(2);
  }

  const map = loadBilibiliCache(cacheDir);
  if (map[cleanBvid]) {
    return map[cleanBvid];
  }

  const cacheKey = `${cacheDir ?? ""}:${cleanBvid}`;
  let p = inflight.get(cacheKey);
  if (!p) {
    p = (async () => {
      try {
        const url = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(cleanBvid)}`;
        const res = await fetchFn(url, {
          headers: {
            'User-Agent': USER_AGENT,
            'Referer': 'https://www.bilibili.com/',
            Accept: 'application/json, text/plain, */*',
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { code: number; data?: { title?: string; pic?: string } };
        if (json.code !== 0 || !json.data) {
          throw new Error(`API code ${json.code}`);
        }
        const rawPic = (json.data.pic ?? "").trim();
        const pic = rawPic.startsWith('//')
          ? `https:${rawPic}`
          : rawPic.replace(/^http:\/\//i, 'https://');
        const title = json.data.title ?? 'bilibili 视频';
        const entry: BilibiliMeta = {
          bvid: cleanBvid,
          title,
          pic,
          fetched_at: now(),
        };
        const currentMap = loadBilibiliCache(cacheDir);
        currentMap[cleanBvid] = entry;
        saveBilibiliCache(currentMap, cacheDir);
        return entry;
      } catch (e) {
        warn(`获取 Bilibili 视频 (${cleanBvid}) 封面与信息失败：${(e as Error).message}。/ Failed to fetch Bilibili metadata for ${cleanBvid}`);
        return null;
      }
    })();
    inflight.set(cacheKey, p);
    void p.then(() => {
      if (inflight.get(cacheKey) === p) inflight.delete(cacheKey);
    });
  }
  return p;
}

export function resetBilibiliState(): void {
  memoryCache.clear();
  inflight.clear();
}
