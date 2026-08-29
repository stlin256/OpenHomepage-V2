/**
 * 图片灯箱的纯逻辑层（可单测）：高分辨率变体 URL 推导与选用决策。
 * 约定（docs/specs/03 §5）：同目录同名加 -full 后缀，
 * 如 assets/hero.jpg → assets/hero-full.jpg，存在则灯箱加载高清版。
 * 浏览器脚本（src/scripts/lightbox.ts）只做 DOM/事件。
 */

const EXT_RE = /(\.[a-z0-9]+)((?:\?|#).*)?$/i;

/** 已知不存在高清变体的 URL（onerror 探测到的 404 或预加载失败），供灯箱与空闲预加载共享 */
export const fullBad = new Set<string>();

export function markLightboxBad(url: string): void {
  fullBad.add(url);
}

export function isLightboxBad(url: string): boolean {
  return fullBad.has(url);
}

export function resetLightboxBad(): void {
  fullBad.clear();
}

/**
 * 原图 URL → 高清变体 URL。
 * 无扩展名、data:/blob: URL、或本身已是 -full 变体时返回 null（不再二次派生）。
 */
export function fullVariantUrl(src: string): string | null {
  if (!src || /^(data|blob):/i.test(src)) return null;
  const m = EXT_RE.exec(src);
  if (!m) return null;
  const stem = src.slice(0, m.index);
  if (stem.endsWith('-full')) return null;
  return `${stem}-full${m[1]}${m[2] ?? ''}`;
}

/**
 * 灯箱候选地址（按优先级尝试）：
 * 1. 原图的高清变体（assets/hero.jpg → assets/hero-full.jpg）
 * 2. 原图本体（保留 JPG/PNG，供高清查看与另存为）
 * 3. 页面图本体（WebP 兜底；原图存在时不再派生页面 -full，避免无效请求）
 */
export function lightboxCandidateUrls(inPageSrc: string, originalSrc?: string | null): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const add = (url: string | null | undefined) => {
    if (!url) return;
    if (!seen.has(url)) {
      seen.add(url);
      candidates.push(url);
    }
  };

  if (originalSrc && originalSrc !== inPageSrc) {
    add(fullVariantUrl(originalSrc));
    add(originalSrc);
    add(inPageSrc);
    return candidates;
  }
  add(fullVariantUrl(inPageSrc));
  add(inPageSrc);

  return candidates;
}

/**
 * 灯箱实际加载地址：hasFull 判定候选存在则选用，否则逐级回退。
 * hasFull 缺省时乐观假定变体存在（调用方负责加载失败回退原图）。
 */
export function pickLightboxSrc(
  src: string,
  hasFull?: (fullUrl: string) => boolean,
  originalSrc?: string | null,
): string {
  const candidates = lightboxCandidateUrls(src, originalSrc);
  if (!hasFull) return candidates[0] ?? src;
  for (const c of candidates) {
    if (c === src || hasFull(c)) return c;
  }
  return src;
}
