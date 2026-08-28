/**
 * 站内页面 HTML 内存缓存：语言切换、标签预取与内容交换共用，
 * 同一页面的整份 HTML 每次会话只下载一次。
 * 失败结果不缓存（下次导航/预取重试）；dev 模式禁用缓存，保证修改即时可见。
 */

async function fetchPage(path: string): Promise<string | null> {
  try {
    const r = await fetch(path);
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

/** 构造带开关的页面抓取器（enabled=false 时绕过缓存，便于 dev 与测试）。 */
export function createPageFetcher(enabled: boolean): (path: string) => Promise<string | null> {
  const cache = new Map<string, Promise<string | null>>();
  return (path: string) => {
    if (!enabled) return fetchPage(path);
    let cached = cache.get(path);
    if (!cached) {
      cached = fetchPage(path);
      cache.set(path, cached);
      // 失败不留缓存，下次导航/预取重试
      void cached.then((html) => {
        if (html === null && cache.get(path) === cached) cache.delete(path);
      });
    }
    return cached;
  };
}

export const fetchPageHtml = createPageFetcher(!import.meta.env.DEV);
