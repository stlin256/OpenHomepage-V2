import { describe, it, expect } from 'vitest';
import {
  hexToRgb,
  rgbToHex,
  relativeLuminance,
  contrastRatio,
  pickContrastText,
  correctAccentForDark,
  buildAccentTheme,
  initialTheme,
  toggleTheme,
  carryThemeAttrs,
  DARK_BG,
} from '../src/lib/theme.ts';

describe('hexToRgb / rgbToHex', () => {
  it('解析 #rrggbb', () => {
    expect(hexToRgb('#3a7bd5')).toEqual({ r: 58, g: 123, b: 213 });
  });

  it('解析 #rgb 短形式并归一为小写 hex', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(rgbToHex(hexToRgb('#ABC'))).toBe('#aabbcc');
  });

  it('非法输入抛出中文错误', () => {
    expect(() => hexToRgb('red')).toThrowError(/颜色值/);
    expect(() => hexToRgb('#12345')).toThrowError(/颜色值/);
  });
});

describe('relativeLuminance / contrastRatio', () => {
  it('黑白相对亮度分别为 0 和 1', () => {
    expect(relativeLuminance(hexToRgb('#000000'))).toBe(0);
    expect(relativeLuminance(hexToRgb('#ffffff'))).toBeCloseTo(1, 5);
  });

  it('黑白对比度为 21:1，且比值与参数顺序无关', () => {
    const black = hexToRgb('#000000');
    const white = hexToRgb('#ffffff');
    expect(contrastRatio(black, white)).toBeCloseTo(21, 0);
    expect(contrastRatio(white, black)).toBeCloseTo(21, 0);
  });

  it('相同颜色对比度为 1:1', () => {
    const c = hexToRgb('#3a7bd5');
    expect(contrastRatio(c, c)).toBeCloseTo(1, 5);
  });
});

describe('pickContrastText', () => {
  it('深色底上选浅色文字', () => {
    expect(pickContrastText('#121417')).toBe('#ffffff');
  });

  it('浅色底上选深色文字', () => {
    expect(pickContrastText('#f6f7f8')).toBe('#1a1d21');
  });

  it('示例 accent #3a7bd5 上白色文字对比度更高', () => {
    expect(pickContrastText('#3a7bd5')).toBe('#ffffff');
  });
});

describe('correctAccentForDark', () => {
  it('对比度已达标（≥4.5:1）的 accent 原样返回', () => {
    // #8ab4ff 在 #121417 上对比度远高于 4.5:1
    expect(correctAccentForDark('#8ab4ff')).toBe('#8ab4ff');
  });

  it('对比度不足时逐档提亮直至 ≥4.5:1', () => {
    const corrected = correctAccentForDark('#3a7bd5');
    expect(corrected).not.toBe('#3a7bd5');
    expect(corrected).toMatch(/^#[0-9a-f]{6}$/);
    expect(contrastRatio(hexToRgb(corrected), hexToRgb(DARK_BG))).toBeGreaterThanOrEqual(4.5);
  });

  it('极深 accent 也能提亮到达标', () => {
    const corrected = correctAccentForDark('#123a6b');
    expect(contrastRatio(hexToRgb(corrected), hexToRgb(DARK_BG))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('buildAccentTheme', () => {
  it('输出明暗两套 accent 与对比文字色', () => {
    const theme = buildAccentTheme('#3a7bd5');
    expect(theme.light.accent).toBe('#3a7bd5');
    expect(theme.light.contrast).toBe('#ffffff');
    expect(contrastRatio(hexToRgb(theme.dark.accent), hexToRgb(DARK_BG))).toBeGreaterThanOrEqual(4.5);
    expect(['#1a1d21', '#ffffff']).toContain(theme.dark.contrast);
  });

  it('缺省参数使用默认 accent', () => {
    const theme = buildAccentTheme();
    expect(theme.light.accent).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('initialTheme（亮/暗两态，见 spec 10）', () => {
  it('sessionStorage 有用户选择时优先（覆盖系统与站点默认）', () => {
    expect(initialTheme('dark', 'system', false)).toBe('dark');
    expect(initialTheme('light', 'system', true)).toBe('light');
    expect(initialTheme('light', 'dark', true)).toBe('light');
  });

  it('无用户选择：站点默认模式为 light/dark 时用之', () => {
    expect(initialTheme(null, 'dark', false)).toBe('dark');
    expect(initialTheme(null, 'light', true)).toBe('light');
  });

  it('无用户选择且默认 system：跟随系统', () => {
    expect(initialTheme(null, 'system', true)).toBe('dark');
    expect(initialTheme(null, 'system', false)).toBe('light');
  });

  it('非法存储值视为未选择', () => {
    expect(initialTheme('system', 'system', true)).toBe('dark');
    expect(initialTheme('', 'light', false)).toBe('light');
  });
});

describe('toggleTheme', () => {
  it('亮暗互换', () => {
    expect(toggleTheme('light')).toBe('dark');
    expect(toggleTheme('dark')).toBe('light');
  });
});

describe('carryThemeAttrs（ClientRouter before-swap 防闪白）', () => {
  /** Map 实现的 AttrCarrier 测试替身 */
  function fakeEl(attrs: Record<string, string>) {
    const map = new Map(Object.entries(attrs));
    return {
      getAttribute: (n: string) => map.get(n) ?? null,
      setAttribute: (n: string, v: string) => void map.set(n, v),
      has: (n: string) => map.has(n),
    };
  }

  it('复制 data-theme / 内联 accent style / class（.js 标记）到新文档', () => {
    const from = fakeEl({
      'data-theme': 'dark',
      style: '--accent-light:#3a7bd5;',
      class: 'js',
      lang: 'zh-CN',
    });
    // 新文档为 SSR 默认值（亮色、无 class）
    const to = fakeEl({ 'data-theme': 'light', lang: 'zh-CN' });
    carryThemeAttrs(from, to);
    expect(to.getAttribute('data-theme')).toBe('dark');
    expect(to.getAttribute('style')).toBe('--accent-light:#3a7bd5;');
    expect(to.getAttribute('class')).toBe('js');
    // 不搬运 lang 等其他属性（语言页切换时 lang 必须保留新文档的 SSR 值）
    expect(to.getAttribute('lang')).toBe('zh-CN');
  });

  it('旧文档缺某属性时不写入（保留新文档原值）', () => {
    const from = fakeEl({ 'data-theme': 'dark' });
    const to = fakeEl({ style: 'keep-me', class: 'other' });
    carryThemeAttrs(from, to);
    expect(to.getAttribute('data-theme')).toBe('dark');
    expect(to.getAttribute('style')).toBe('keep-me');
    expect(to.getAttribute('class')).toBe('other');
  });
});
