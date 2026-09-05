import { describe, it, expect } from 'vitest';
import {
  isValidHex,
  normalizeHex,
  hexToRgb,
  rgbToHex,
  contrastRatio,
  colorDistance,
  extractPalette,
} from '../admin/shared/color.ts';

describe('hex 校验与规范化', () => {
  it('接受 #rgb / #rrggbb（大小写不敏感）', () => {
    expect(isValidHex('#fff')).toBe(true);
    expect(isValidHex('#3A7BD5')).toBe(true);
    expect(isValidHex('red')).toBe(false);
    expect(isValidHex('#12345')).toBe(false);
    expect(isValidHex('')).toBe(false);
  });

  it('normalizeHex 统一为小写 #rrggbb；非法返回 null', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('#3A7BD5')).toBe('#3a7bd5');
    expect(normalizeHex('3a7bd5')).toBe('#3a7bd5');
    expect(normalizeHex('red')).toBeNull();
  });

  it('hexToRgb / rgbToHex 互逆', () => {
    expect(hexToRgb('#3a7bd5')).toEqual([58, 123, 213]);
    expect(rgbToHex(58, 123, 213)).toBe('#3a7bd5');
    expect(rgbToHex(...hexToRgb('#000000'))).toBe('#000000');
  });
});

describe('对比度与距离', () => {
  it('黑白对比度 21:1，同色 1:1', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0);
    expect(contrastRatio([58, 123, 213], [58, 123, 213])).toBeCloseTo(1, 5);
  });

  it('colorDistance 为 RGB 欧氏距离', () => {
    expect(colorDistance([0, 0, 0], [255, 255, 255])).toBeCloseTo(Math.sqrt(3 * 255 * 255), 5);
    expect(colorDistance([10, 10, 10], [10, 10, 10])).toBe(0);
  });
});

describe('extractPalette 头像候选色提取', () => {
  /** 构造 RGBA 像素数组：n 个 (r,g,b) 像素 */
  function pixels(runs: [number, number, number, number][]): Uint8ClampedArray {
    const out: number[] = [];
    for (const [r, g, b, n] of runs) {
      for (let i = 0; i < n; i++) out.push(r, g, b, 255);
    }
    return new Uint8ClampedArray(out);
  }

  it('从主导色块中提取候选色（红色块 + 蓝色块）', () => {
    const data = pixels([
      [220, 30, 30, 400],
      [30, 30, 220, 300],
      [240, 240, 240, 100],
    ]);
    const palette = extractPalette(data, 4);
    expect(palette.length).toBeGreaterThanOrEqual(2);
    expect(palette.length).toBeLessThanOrEqual(4);
    // 前两名应接近两个主导色
    const [r1, g1, b1] = hexToRgb(palette[0]);
    expect(colorDistance([r1, g1, b1], [220, 30, 30])).toBeLessThan(60);
    const [r2, g2, b2] = hexToRgb(palette[1]);
    expect(colorDistance([r2, g2, b2], [30, 30, 220])).toBeLessThan(60);
  });

  it('跳过透明像素', () => {
    const data = new Uint8ClampedArray([
      ...Array.from({ length: 100 }, () => [10, 200, 10, 255]).flat(),
      ...Array.from({ length: 900 }, () => [250, 0, 0, 20]).flat(),
    ]);
    const palette = extractPalette(data, 3);
    const [r, g] = hexToRgb(palette[0]);
    expect(g).toBeGreaterThan(150);
    expect(r).toBeLessThan(80);
  });

  it('空输入返回空数组', () => {
    expect(extractPalette(new Uint8ClampedArray(0), 5)).toEqual([]);
  });

  it('候选色两两保持最小区分度', () => {
    const data = pixels([
      [100, 100, 100, 100],
      [103, 102, 101, 100],
      [200, 50, 50, 100],
    ]);
    const palette = extractPalette(data, 4);
    for (let i = 0; i < palette.length; i++) {
      for (let j = i + 1; j < palette.length; j++) {
        expect(colorDistance(hexToRgb(palette[i]), hexToRgb(palette[j]))).toBeGreaterThan(30);
      }
    }
  });
});
