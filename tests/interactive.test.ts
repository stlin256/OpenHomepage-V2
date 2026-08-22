import { describe, it, expect } from 'vitest';
import {
  popoverPlacement,
  magnetOffset,
  isPauseToken,
  tokenDelay,
  parallaxShift,
  embedCoverUrl,
  JITTER_RATIO,
  MAGNET_MAX,
  PARALLAX_MAX,
  PAUSE_MAX_MS,
} from '../src/lib/interactive.ts';

describe('popoverPlacement', () => {
  const vh = 800;
  it('下方空间够 → bottom', () => {
    expect(popoverPlacement({ top: 100, bottom: 200 }, 300, vh)).toBe('bottom');
  });
  it('下方不够、上方够 → top', () => {
    expect(popoverPlacement({ top: 600, bottom: 750 }, 300, vh)).toBe('top');
  });
  it('两侧都不够时放在空间较大的一侧（相等取下方）', () => {
    // 上 342 = 下 342 → bottom；top 上移则上方更大 → top
    expect(popoverPlacement({ top: 350, bottom: 450 }, 500, vh)).toBe('bottom');
    expect(popoverPlacement({ top: 390, bottom: 460 }, 500, vh)).toBe('top');
    expect(popoverPlacement({ top: 300, bottom: 400 }, 500, vh)).toBe('bottom');
  });
});

describe('magnetOffset', () => {
  it('按强度缩放并 clamp 到 ±6px', () => {
    expect(magnetOffset(10, -10)).toEqual({ x: 2, y: -2 });
    expect(magnetOffset(100, -100)).toEqual({ x: MAGNET_MAX, y: -MAGNET_MAX });
    expect(magnetOffset(0, 0)).toEqual({ x: 0, y: 0 });
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

describe('embedCoverUrl', () => {
  it('youtube 有 CDN 封面；bilibili 返回 null（纯色占位）', () => {
    expect(embedCoverUrl('youtube', 'abc123')).toBe('https://i.ytimg.com/vi/abc123/hqdefault.jpg');
    expect(embedCoverUrl('bilibili', 'BV1xx')).toBeNull();
  });
});
