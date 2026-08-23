/**
 * 图片灯箱的纯逻辑层（可单测）：高分辨率变体 URL 推导与选用决策。
 * 约定（docs/specs/03 §5）：同目录同名加 -full 后缀，
 * 如 assets/hero.jpg → assets/hero-full.jpg，存在则灯箱加载高清版。
 * 浏览器脚本（src/scripts/lightbox.ts）只做 DOM/事件。
 */

const EXT_RE = /(\.[a-z0-9]+)((?:\?|#).*)?$/i;

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
 * 灯箱实际加载地址：hasFull 判定高清变体存在则用变体，否则用原图。
 * hasFull 缺省时乐观假定变体存在（调用方负责加载失败回退原图）。
 */
export function pickLightboxSrc(src: string, hasFull?: (fullUrl: string) => boolean): string {
  const full = fullVariantUrl(src);
  if (!full) return src;
  return !hasFull || hasFull(full) ? full : src;
}
