/**
 * 前端交互的纯逻辑层（可单测）：RSS 浮层方向决策、磁吸位移、流式打字节奏、
 * 视差位移、嵌入封面 URL。浏览器脚本（src/scripts/）只负责 DOM/事件，
 * 决策与计算全部收口到这里。
 */

/** RSS hover 浮层展示延迟（spec 05：hover 300ms 后浮出） */
export const POPOVER_SHOW_DELAY = 300;
/** 浮层收起延迟（spec 05：离开 150ms 后收起） */
export const POPOVER_HIDE_DELAY = 150;
/** 磁吸最大位移 px（spec 09：≤6px） */
export const MAGNET_MAX = 6;
/** 视差最大位移 px（spec 09：≤40px） */
export const PARALLAX_MAX = 40;
/** 打字抖动幅度（spec 04：±40%） */
export const JITTER_RATIO = 0.4;
/** 标点后额外停顿上限 ms */
export const PAUSE_MAX_MS = 400;

export interface Rect {
  top: number;
  bottom: number;
}

/**
 * 浮层方向决策：下方空间够（含 gap）→ bottom；否则上方够 → top；
 * 都不够 → 放在空间较大的一侧。
 */
export function popoverPlacement(
  card: Rect,
  popoverHeight: number,
  viewportHeight: number,
  gap = 8,
): 'top' | 'bottom' {
  const below = viewportHeight - card.bottom - gap;
  const above = card.top - gap;
  if (below >= popoverHeight) return 'bottom';
  if (above >= popoverHeight) return 'top';
  return below >= above ? 'bottom' : 'top';
}

/**
 * 磁吸位移：指针相对元素中心的偏移 × strength，双向 clamp 到 ±max。
 * 移动端/触摸环境由调用方整体关闭（不调用本函数）。
 */
export function magnetOffset(
  dx: number,
  dy: number,
  max = MAGNET_MAX,
  strength = 0.2,
): { x: number; y: number } {
  const clamp = (v: number) => Math.max(-max, Math.min(max, v));
  return { x: clamp(dx * strength), y: clamp(dy * strength) };
}

/** 标点 token 判定（标点后加短停顿，spec 04 §2） */
const PAUSE_RE = /[。，、！？；：…,.!?;:—–\-]$/;

export function isPauseToken(tokenText: string): boolean {
  return PAUSE_RE.test(tokenText.trimEnd());
}

/**
 * 单个 token 的展示间隔（ms）：base ±40% 随机抖动；标点 token 追加短停顿
 * （+8×base，封顶 PAUSE_MAX_MS）；纯空白 token（代码块换行等）零停顿。
 * rand 可注入（默认 Math.random），便于单测。
 */
export function tokenDelay(
  baseMs: number,
  tokenText: string,
  rand: () => number = Math.random,
): number {
  if (tokenText.trim() === '') return 0;
  const jitter = baseMs * (1 + (rand() * 2 - 1) * JITTER_RATIO);
  const pause = isPauseToken(tokenText) ? Math.min(baseMs * 8, PAUSE_MAX_MS) : 0;
  return Math.round(jitter + pause);
}

/**
 * 视差位移：progress ∈ [-1, 1]（元素中心相对视口中心的归一化位置），
 * 输出 clamp 后的 translateY（px，≤ max）。
 */
export function parallaxShift(progress: number, max = PARALLAX_MAX): number {
  const p = Math.max(-1, Math.min(1, progress));
  return Math.round(p * max * 100) / 100;
}

/**
 * 嵌入视频封面 URL：youtube 有公开缩略图 CDN；bilibili 封面需 API 查询，
 * 构建期拿不到 → null（前端用纯色 + 播放按钮占位，spec 决策见 09/任务书）。
 */
export function embedCoverUrl(kind: 'bilibili' | 'youtube', id: string): string | null {
  if (kind === 'youtube') return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
  return null;
}
