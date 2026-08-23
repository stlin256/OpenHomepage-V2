import { describe, it, expect } from 'vitest';
import {
  isPauseToken,
  tokenDelay,
  parallaxShift,
  JITTER_RATIO,
  PARALLAX_MAX,
  PAUSE_MAX_MS,
} from '../src/lib/interactive.ts';

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
