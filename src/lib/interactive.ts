/**
 * 前端交互的纯逻辑层（可单测）：RSS 浮层方向决策、流式打字节奏、
 * 视差位移。浏览器脚本（src/scripts/）只负责 DOM/事件，
 * 决策与计算全部收口到这里。
 */

/** RSS hover 浮层展示延迟（spec 05：hover 300ms 后浮出） */
export const POPOVER_SHOW_DELAY = 300;
/** 浮层收起延迟（spec 05：离开 150ms 后收起） */
export const POPOVER_HIDE_DELAY = 150;
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

export interface PopoverPlacement {
  side: 'top' | 'bottom';
  /** 浮层可用最大高度（px）：所在侧放得下时为浮层自然高度；两侧都放不下时收缩到较大一侧（前端配 overflow-y 防截断） */
  maxHeight: number;
}

/**
 * 浮层方向决策（基于卡片在视口中的位置）：默认弹向卡片上方；
 * 上方空间不足（含 gap）才翻转到下方；两侧都放不下 → 放在空间较大的一侧并
 * 以 maxHeight 收缩，保证不溢出视口。
 */
export function popoverPlacement(
  card: Rect,
  popoverHeight: number,
  viewportHeight: number,
  gap = 8,
): PopoverPlacement {
  const above = Math.max(0, card.top - gap);
  const below = Math.max(0, viewportHeight - card.bottom - gap);
  if (above >= popoverHeight) return { side: 'top', maxHeight: popoverHeight };
  if (below >= popoverHeight) return { side: 'bottom', maxHeight: popoverHeight };
  return above >= below
    ? { side: 'top', maxHeight: above }
    : { side: 'bottom', maxHeight: below };
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
