/**
 * 主题色计算：纯函数，不依赖 Astro，供构建期注入 CSS 变量与单测复用。
 * 规则见 docs/specs/10-theme-colors.md：
 * - accent 由 site.yaml 配置，浅色主题原样使用；
 * - 深色主题下若 accent 与深底对比度 < 4.5:1（WCAG AA），逐档提亮直至达标；
 * - accent 底色上的文字色（--accent-contrast）在深/浅候选中取对比度更高者。
 */

/** 深色主题页面底色（与 src/styles/global.css 中 --bg 深色值一致） */
export const DARK_BG = '#121417';
/** 对比文字候选：深色 / 浅色（与 --text 浅色值一致） */
export const CONTRAST_DARK_TEXT = '#1a1d21';
export const CONTRAST_LIGHT_TEXT = '#ffffff';
/** site.yaml 未配置 theme.accent 时的默认值 */
export const DEFAULT_ACCENT = '#3a7bd5';
/** WCAG AA 正文对比度阈值 */
export const CONTRAST_THRESHOLD = 4.5;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`非法颜色值："${hex}"，需要 #rgb 或 #rrggbb 形式`);
  let h = m[1];
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

/** WCAG 相对亮度（0–1） */
export function relativeLuminance(c: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** WCAG 对比度（1–21），与参数顺序无关 */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** accent 底色上的文字色：深/浅候选中取对比度更高者 */
export function pickContrastText(
  bgHex: string,
  dark: string = CONTRAST_DARK_TEXT,
  light: string = CONTRAST_LIGHT_TEXT,
): string {
  const bg = hexToRgb(bgHex);
  return contrastRatio(hexToRgb(dark), bg) >= contrastRatio(hexToRgb(light), bg) ? dark : light;
}

/** 向白色混合 amount（0–1）提亮一档 */
function lighten(c: Rgb, amount: number): Rgb {
  return {
    r: c.r + (255 - c.r) * amount,
    g: c.g + (255 - c.g) * amount,
    b: c.b + (255 - c.b) * amount,
  };
}

/**
 * 深色模式 accent 校正：与深底对比度达标则原样返回，
 * 否则按 12% 逐档提亮（最多 20 档）直至 ≥ threshold。
 */
export function correctAccentForDark(
  accent: string,
  darkBg: string = DARK_BG,
  threshold: number = CONTRAST_THRESHOLD,
): string {
  const bg = hexToRgb(darkBg);
  let color = hexToRgb(accent);
  for (let i = 0; i < 20 && contrastRatio(color, bg) < threshold; i++) {
    color = lighten(color, 0.12);
  }
  return rgbToHex(color);
}

export interface AccentTheme {
  light: { accent: string; contrast: string };
  dark: { accent: string; contrast: string };
}

/** 构建期一次算出明暗两套 accent 值，注入为 CSS 变量 */
export function buildAccentTheme(accent: string = DEFAULT_ACCENT): AccentTheme {
  const darkAccent = correctAccentForDark(accent);
  return {
    light: { accent, contrast: pickContrastText(accent) },
    dark: { accent: darkAccent, contrast: pickContrastText(darkAccent) },
  };
}

// ---------------------------------------------------------------------------
// 亮/暗主题模式（两态）：初始主题解析与切换。
// 行为契约（spec 10 §3）：页面打开时无用户选择则跟随系统（或 site.yaml
// theme.default_mode 的 light/dark）；用户手动切换后写入 sessionStorage，
// 本次会话内（含站内导航转场）保持，离开站点后重置。
// ---------------------------------------------------------------------------

export type ThemeName = 'light' | 'dark';
export type ThemeModeSetting = 'system' | 'light' | 'dark';

/**
 * 初始主题：sessionStorage 中的用户选择（'light'/'dark'，其余值视为未选择）
 * > site.yaml default_mode 为 light/dark 时 > 跟随系统。
 */
export function initialTheme(
  saved: string | null,
  defaultMode: ThemeModeSetting = 'system',
  systemDark: boolean = false,
): ThemeName {
  if (saved === 'light' || saved === 'dark') return saved;
  if (defaultMode === 'light' || defaultMode === 'dark') return defaultMode;
  return systemDark ? 'dark' : 'light';
}

/** 两态切换（无"跟随系统"第三态，系统变化只在无用户选择时生效，见前端脚本） */
export function toggleTheme(current: ThemeName): ThemeName {
  return current === 'dark' ? 'light' : 'dark';
}

/** getAttribute/setAttribute 的最小元素接口（document.documentElement 或测试替身） */
export interface AttrCarrier {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
}

/**
 * ClientRouter 转场防闪白（spec 10 §3）：swap 会把 <html> 属性还原为 SSR 值
 * （data-theme="light"、无 .js 标记），而 after-swap 重放发生在渲染之后，
 * 暗色下会先闪一帧白。在 astro:before-swap 把旧 <html> 的主题相关属性
 * （data-theme / 内联 accent style / class 上的 .js 标记）复制到新文档 <html>，
 * 保证 swap 完成瞬间主题已正确；after-swap 重放保留作兜底。
 */
export function carryThemeAttrs(from: AttrCarrier, to: AttrCarrier): void {
  for (const name of ['data-theme', 'style', 'class']) {
    const v = from.getAttribute(name);
    if (v !== null) to.setAttribute(name, v);
  }
}
