import { describe, it, expect } from 'vitest';
import {
  popoverPlacement,
  isPauseToken,
  tokenDelay,
  parallaxShift,
  JITTER_RATIO,
  PARALLAX_MAX,
  PAUSE_MAX_MS,
} from '../src/lib/interactive.ts';

describe('popoverPlacement', () => {
  const vh = 800;
  it('上方空间够 → top（默认向卡片上方弹出）', () => {
    // 上 92 不够 300？不：top=400 → above=392 ≥ 300 → top，即使下方也够
    expect(popoverPlacement({ top: 400, bottom: 500 }, 300, vh)).toEqual({
      side: 'top',
      maxHeight: 300,
    });
  });
  it('上方不够、下方够 → bottom（上方不足才翻转）', () => {
    // above = 100-8 = 92 < 300；below = 800-200-8 = 592 ≥ 300
    expect(popoverPlacement({ top: 100, bottom: 200 }, 300, vh)).toEqual({
      side: 'bottom',
      maxHeight: 300,
    });
  });
  it('卡片贴视口顶部（上方空间为 0）→ bottom', () => {
    expect(popoverPlacement({ top: 0, bottom: 100 }, 300, vh).side).toBe('bottom');
  });
  it('两侧都不够 → 放在空间较大的一侧，maxHeight 收缩到该侧空间（防截断）', () => {
    // 上 342 = 下 342 → 平局取上方；下方更大时取下方
    expect(popoverPlacement({ top: 350, bottom: 450 }, 500, vh)).toEqual({
      side: 'top',
      maxHeight: 342,
    });
    expect(popoverPlacement({ top: 390, bottom: 460 }, 500, vh)).toEqual({
      side: 'top',
      maxHeight: 382,
    });
    expect(popoverPlacement({ top: 300, bottom: 400 }, 500, vh)).toEqual({
      side: 'bottom',
      maxHeight: 392,
    });
  });
  it('卡片超出视口（滚动中）：上方空间按视口顶 clamp 不为负', () => {
    const p = popoverPlacement({ top: -50, bottom: 700 }, 300, vh);
    expect(p.maxHeight).toBeGreaterThanOrEqual(0);
    expect(p.side).toBe('bottom'); // above=0，below=92 更大
  });
});

describe('isPauseToken / tokenDelay', () => {
  it('中英文标点判定', () => {
    expect(isPauseToken('，')).toBe(true);
    expect(isPauseToken('done.')).toBe(true);
    expect(isPauseToken('好')).toBe(false);
    expect(isPauseToken(' ')).toBe(false);
  });

  it('抖动在 base ±40% 内；标点追加停顿；空白零停顿', () => {
    const base = 100;
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      const d = tokenDelay(base, '字', () => r);
      expect(d).toBeGreaterThanOrEqual(Math.round(base * (1 - JITTER_RATIO)));
      expect(d).toBeLessThanOrEqual(Math.round(base * (1 + JITTER_RATIO)));
    }
    expect(tokenDelay(base, '字', () => 0.5)).toBe(100);
    // 标点：100 + min(800, 400) = 500
    expect(tokenDelay(base, '。', () => 0.5)).toBe(100 + Math.min(base * 8, PAUSE_MAX_MS));
    expect(tokenDelay(base, '\n')).toBe(0);
    expect(tokenDelay(base, '  ')).toBe(0);
  });
});

describe('parallaxShift', () => {
  it('progress 归一化映射到 ±max 并 clamp', () => {
    expect(parallaxShift(0)).toBe(0);
    expect(parallaxShift(1)).toBe(PARALLAX_MAX);
    expect(parallaxShift(-1)).toBe(-PARALLAX_MAX);
    expect(parallaxShift(2)).toBe(PARALLAX_MAX);
    expect(parallaxShift(0.5, 40)).toBe(20);
  });
});
