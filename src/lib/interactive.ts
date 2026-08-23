/**
 * 前端交互的纯逻辑层（可单测）：流式打字节奏、视差位移。
 * 浏览器脚本（src/scripts/）只负责 DOM/事件，决策与计算全部收口到这里。
 * （RSS hover 浮层已按用户要求移除，popoverPlacement 随之删除。）
 */

/** 视差最大位移 px（spec 09：≤40px） */
export const PARALLAX_MAX = 40;
/** 打字抖动幅度（spec 04：±40%） */
export const JITTER_RATIO = 0.4;
/** 标点后额外停顿上限 ms */
export const PAUSE_MAX_MS = 400;

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
 * 热力图格子 tooltip 水平定位：以格中心为锚点居中，clamp 到 [minX, maxX] 容器边界内；
 * tooltip 比容器还宽时贴左缘（保证不溢出右界由 CSS max-width 兜底）。
 */
export function tooltipLeft(centerX: number, tipWidth: number, minX: number, maxX: number): number {
  const ideal = centerX - tipWidth / 2;
  if (tipWidth >= maxX - minX) return minX;
  return Math.max(minX, Math.min(maxX - tipWidth, ideal));
}
