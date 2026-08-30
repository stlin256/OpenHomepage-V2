/**
 * YouTube 视频元数据解析：
 * 通过官方 oEmbed 接口获取标题与封面 URL，
 * 并持久化在 .cache/youtube.json 中，避免构建时重复请求。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface YouTubeMeta {
  id: string;
  title: string;
  thumbnail_url: string;
  fetched_at: number;
}

export type YouTubeMetaMap = Record<string, YouTubeMeta>;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DEFAULT_TIMEOUT_MS = 10_000;

const memoryCache = new Map<string, YouTubeMetaMap>();
const inflight = new Map<string, Promise<YouTubeMeta | null>>();

function cacheFileOf(cacheDir?: string): string {
  return path.join(cacheDir ?? path.resolve('.cache'), 'youtube.json');
}

export function loadYouTubeCache(cacheDir?: string): YouTubeMetaMap {
  const file = cacheFileOf(cacheDir);
  let map = memoryCache.get(file);
  if (map) return map;
  try {
    if (existsSync(file)) {
      map = JSON.parse(readFileSync(file, 'utf8')) as YouTubeMetaMap;
    } else {
      map = {};
    }
  } catch {
    map = {};
  }
  memoryCache.set(file, map);
  return map;
}

export function saveYouTubeCache(map: YouTubeMetaMap, cacheDir?: string): void {
  const file = cacheFileOf(cacheDir);
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
  memoryCache.set(file, map);
}

export interface FetchYouTubeOptions {
  cacheDir?: string;
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  now?: () => number;
  timeoutMs?: number;
  warn?: (msg: string) => void;
}

/**
 * 获取单个 YouTube 视频的元数据（标题 + 封面图 URL）。
 * 优先读缓存；未命中时调用官方 oEmbed 接口，成功后写入缓存；
 * 网络失败回退 null，不阻断构建。
 */
export async function fetchYouTubeMeta(
  id: string,
  options: FetchYouTubeOptions = {},
): Promise<YouTubeMeta | null> {
  const { cacheDir, timeoutMs = DEFAULT_TIMEOUT_MS, warn = console.warn } = options;
  const now = options.now ?? (() => Date.now());
  const fetchFn = options.fetchFn ?? (globalThis.fetch as typeof fetch);

  const cleanId = id.trim();
  if (!cleanId) return null;

  const map = loadYouTubeCache(cacheDir);
  if (map[cleanId]) {
    return map[cleanId];
  }

  const cacheKey = `${cacheDir ?? ''}:${cleanId}`;
  let p = inflight.get(cacheKey);
  if (!p) {
    p = (async () => {
      try {
        const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(cleanId)}`;
        const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`;
        const res = await fetchFn(url, {
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'application/json, text/plain, */*',
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { title?: string; thumbnail_url?: string };
        if (!json.title) throw new Error('Missing title');
        const entry: YouTubeMeta = {
          id: cleanId,
          title: json.title,
          thumbnail_url: json.thumbnail_url ?? '',
          fetched_at: now(),
        };
        const currentMap = loadYouTubeCache(cacheDir);
        currentMap[cleanId] = entry;
        saveYouTubeCache(currentMap, cacheDir);
        return entry;
      } catch (e) {
        warn(`获取 YouTube 视频 (${cleanId}) 信息失败：${(e as Error).message}。/ Failed to fetch YouTube metadata for ${cleanId}`);
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

export function resetYouTubeState(): void {
  memoryCache.clear();
  inflight.clear();
}
