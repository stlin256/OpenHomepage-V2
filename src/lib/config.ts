/**
 * data/ 配置加载层：纯 Node 实现，不依赖 Astro API，便于单测。
 * 所有函数以 data 根目录作为参数传入。
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';

import { type LocalizedText, resolveText } from './localize.ts';
import { normalizeNotice, type PageNotice } from './notice.ts';

export type { LocalizedText };
export { resolveText, normalizeNotice };
export type { PageNotice };

export interface SiteConfig {
  site: {
    title: LocalizedText;
    description?: LocalizedText;
    language?: string;
    /** 站点图标（favicon），相对 data/ 的路径，如 assets/favicon.svg（svg/png/ico） */
    favicon?: string;
  };
  profile: {
    name: LocalizedText;
    tagline?: LocalizedText;
    avatar?: string;
    /** 头像布局：side=姓名/简介右侧（杂志分栏，默认）；top=头像居顶居中 */
    avatar_position?: 'side' | 'top';
    bio_page?: string;
    links?: { label: string; url: string }[];
  };
  theme?: {
    accent?: string;
    default_mode?: 'system' | 'light' | 'dark';
    /** 浅色页面底色；缺省使用米黄编辑风默认值 */
    background?: string;
    /** 暗色页面底色；缺省使用暖黑默认值 */
    background_dark?: string;
  };
  github: {
    username: string;
    show_contributions?: boolean;
    pinned?: { repo: string; note?: LocalizedText }[];
  };
  rss?: {
    enabled?: boolean;
    block_title?: LocalizedText;
    sources_file?: string;
  };
  home?: {
    layout?: { block: string; id?: string }[];
  };
  /** 编辑风格展示区块：列表 / 磁贴 / 归档卡 / 按钮组 / 分割线 */
  editorial_blocks?: EditorialBlock[];
  /** 背景音乐（宽松校验，缺省禁用；归一化见 resolveBgm） */
  bgm?: {
    /** 音频文件，相对 data/ 的路径，如 assets/bgm.wav */
    file?: string;
    /** 音量 0–1，缺省 0.4 */
    volume?: number;
    /** false 强制关闭；缺省（配置了 file）即启用 */
    enabled?: boolean;
    /** 自动播放（首次用户交互后开播，绕浏览器策略）；缺省 false */
    autoplay?: boolean;
  };
  /** 页脚（默认开启；显式 enabled:false 关闭；text 支持内联 [label](url) 链接） */
  footer?: {
    enabled?: boolean;
    text?: LocalizedText;
  };
  /** 右下角联系卡与二维码弹层 */
  contact?: {
    intro_card?: {
      enabled?: boolean;
      /** 出现延迟毫秒数，缺省 6000 */
      delay?: number;
      label?: LocalizedText;
      title: LocalizedText;
      description?: LocalizedText;
      image: string;
    };
  };
  streaming_blocks?: {
    id: string;
    title?: LocalizedText;
    content_file: string;
    autoplay?: boolean;
    speed?: number;
  }[];
}

export interface EditorialAction {
  label: LocalizedText;
  url?: string;
  variant?: 'primary' | 'outline' | 'ghost';
}

export interface EditorialListItem {
  title: LocalizedText;
  meta?: LocalizedText;
  description?: LocalizedText;
  image?: string;
  url?: string;
}

export interface EditorialTile {
  title: LocalizedText;
  kicker?: LocalizedText;
  image?: string;
  url?: string;
  size?: 'small' | 'wide' | 'tall';
}

export interface EditorialArchiveCard {
  title: LocalizedText;
  status?: LocalizedText;
  description?: LocalizedText;
  image?: string;
  url?: string;
}

export interface EditorialBlock {
  id: string;
  tag?: LocalizedText;
  title: LocalizedText;
  description?: LocalizedText;
  /** 区块强调色；缺省继承主题 accent */
  color?: string;
  actions?: EditorialAction[];
  list?: EditorialListItem[];
  tiles?: EditorialTile[];
  archive?: EditorialArchiveCard[];
  /** 在区块末尾插入一条编辑感分割线 */
  divider?: boolean;
}

export interface RssSource {
  /** 源名（栏目名 / 卡片来源标签）；支持多语言映射 */
  name: LocalizedText;
  url: string;
  mode: 'latest' | 'curated';
  latest?: number;
  weight?: number;
  cover?: string;
  articles?: { url: string; note?: LocalizedText; cover?: string }[];
}

export interface RssConfig {
  display?: 'grouped' | 'mixed';
  sources: RssSource[];
}

export interface PageEntry {
  lang: string;
  slug: string;
  title: string;
  nav: boolean;
  order?: number;
  description?: string;
  /** 顶端通知横幅（页面控件，仅该页面有效） */
  notice?: PageNotice;
  body: string;
  filePath: string;
}

function readYaml(file: string): unknown {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new Error(`找不到配置文件：${file}`);
  }
  try {
    return loadYaml(text);
  } catch (e) {
    throw new Error(`YAML 解析失败（${file}）：${(e as Error).message}`);
  }
}

/** 校验必需字段，缺失时抛出中文错误 */
function requireField(obj: unknown, dotted: string, file: string): void {
  let cur: unknown = obj;
  for (const key of dotted.split('.')) {
    cur = (cur as Record<string, unknown> | null | undefined)?.[key];
  }
  if (cur === undefined || cur === null || cur === '') {
    throw new Error(`配置缺少必需字段 ${dotted}（${file}）`);
  }
}

/** 校验 site 配置对象（纯函数，缺失/非法字段抛中文错误），供加载与编辑器写盘前复用 */
export function validateSiteConfig(cfg: SiteConfig, file = 'site.yaml'): void {
  requireField(cfg, 'site.title', file);
  requireField(cfg, 'profile.name', file);
  requireField(cfg, 'github.username', file);
}

export function loadSiteConfig(dataDir: string): SiteConfig {
  const file = path.join(dataDir, 'site.yaml');
  const cfg = readYaml(file) as SiteConfig;
  validateSiteConfig(cfg, file);
  return cfg;
}

/** 校验 rss 配置对象（纯函数），供加载与编辑器写盘前复用 */
export function validateRssConfig(cfg: RssConfig, file = 'rss.yaml'): void {
  if (!Array.isArray(cfg.sources) || cfg.sources.length === 0) {
    throw new Error(`${file} 的 sources 不能为空（${file}）`);
  }
  for (const [i, src] of cfg.sources.entries()) {
    requireField(src, 'name', `${file} sources[${i}]`);
    requireField(src, 'url', `${file} sources[${i}]`);
    if (src.mode !== 'latest' && src.mode !== 'curated') {
      throw new Error(
        `${file} sources[${i}]（${src.name}）的 mode 必须是 latest 或 curated，当前为：${src.mode}`
      );
    }
  }
}

export function loadRssConfig(dataDir: string, file = 'rss.yaml'): RssConfig {
  const filePath = path.join(dataDir, file);
  const cfg = readYaml(filePath) as RssConfig;
  validateRssConfig(cfg, filePath);
  return cfg;
}

/** 解析 markdown 文件的 frontmatter（--- 头）与正文 */
function parseFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: text };
  return { data: (loadYaml(m[1]) as Record<string, unknown>) ?? {}, body: text.slice(m[0].length) };
}

/**
 * 扫描 pages/<lang>/*.md。
 * index.md 的 slug 特殊处理为 '/'；frontmatter 显式 slug 优先于文件名。
 * 返回值按 order 升序（缺省 order 排最后，同 order 按 slug 字典序）。
 */
export function loadPages(dataDir: string): PageEntry[] {
  const pagesDir = path.join(dataDir, 'pages');
  if (!existsSync(pagesDir)) return [];

  const pages: PageEntry[] = [];
  for (const lang of readdirSync(pagesDir)) {
    const langDir = path.join(pagesDir, lang);
    if (!statSync(langDir).isDirectory()) continue;
    for (const file of readdirSync(langDir)) {
      if (!file.endsWith('.md')) continue;
      const filePath = path.join(langDir, file);
      const { data, body } = parseFrontmatter(readFileSync(filePath, 'utf8'));
      if (!data.title) {
        throw new Error(`页面缺少必需 frontmatter 字段 title（${filePath}）`);
      }
      const base = file.replace(/\.md$/, "");
      const slug = (data.slug as string | undefined) ?? (base === "index" ? "/" : base);
      const notice = normalizeNotice(data.notice ?? data.banner);
      pages.push({
        lang,
        slug,
        title: data.title as string,
        nav: (data.nav as boolean | undefined) ?? true,
        order: data.order as number | undefined,
        description: data.description as string | undefined,
        notice: notice ?? undefined,
        body,
        filePath,
      });
    }
  }

  return pages.sort(
    (a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.slug.localeCompare(b.slug)
  );
}

/** 返回页面中出现的语言列表（按字典序） */
export function detectLanguages(pages: PageEntry[]): string[] {
  return [...new Set(pages.map((p) => p.lang))].sort();
}

/** ≥2 种语言即启用整站 i18n */
export function isI18nEnabled(langs: string[]): boolean {
  return langs.length >= 2;
}


/** profile.avatar_position 归一化：缺省/非法值回退 'side'（默认侧边杂志布局） */
export function resolveAvatarPosition(profile: SiteConfig['profile']): 'side' | 'top' {
  return profile.avatar_position === 'top' ? 'top' : 'side';
}

export interface ResolvedIntroCard {
  delay: number;
  label: string;
  title: string;
  description: string;
  image: string;
}

/**
 * 右下角联系卡归一化：缺省/显式关闭/缺图片时禁用；
 * delay 限制在 1–20 秒，防止配置错误导致闪烁或长期不出现。
 */
export function resolveIntroCard(
  site: SiteConfig,
  lang: string,
  defaultLang?: string
): ResolvedIntroCard | null {
  const cfg = site.contact?.intro_card;
  if (!cfg || cfg.enabled === false || !cfg.image?.trim()) return null;
  const delay = Number.isFinite(cfg.delay) ? Math.min(20000, Math.max(1000, cfg.delay!)) : 6000;
  return {
    delay,
    label: resolveText(cfg.label ?? 'Hello', lang, defaultLang),
    title: resolveText(cfg.title, lang, defaultLang),
    description: resolveText(cfg.description ?? '', lang, defaultLang),
    image: cfg.image.trim(),
  };
}

/** favicon 允许的扩展名 */
export const FAVICON_EXT_RE = /\.(svg|png|ico)$/i;

/**
 * site.favicon 归一化（宽松校验，与 resolveBgm 同风格）：
 * 未配置/非法扩展名 → null（构建侧回退内置默认 public/favicon.svg）。
 */
export function resolveFavicon(site: SiteConfig): string | null {
  const favicon = site.site?.favicon;
  if (typeof favicon !== 'string') return null;
  const f = favicon.trim();
  return f && FAVICON_EXT_RE.test(f) ? f : null;
}

/** BGM 缺省音量（未配置或非法时回退） */
export const BGM_DEFAULT_VOLUME = 0.4;

export interface ResolvedBgm {
  file: string;
  volume: number;
  autoplay: boolean;
}

/**
 * BGM 配置归一化（宽松校验，spec 01 §1）：
 * 无 bgm 段 / 无 file / 显式 enabled:false → null（禁用）；
 * volume clamp 到 [0,1]，缺省/非法回退 BGM_DEFAULT_VOLUME。
 */
export function resolveBgm(site: SiteConfig): ResolvedBgm | null {
  const bgm = site.bgm;
  if (!bgm || typeof bgm !== 'object' || bgm.enabled === false) return null;
  const file = typeof bgm.file === 'string' ? bgm.file.trim() : '';
  if (!file) return null;
  const v = bgm.volume;
  const volume =
    typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : BGM_DEFAULT_VOLUME;
  return { file, volume, autoplay: bgm.autoplay === true };
}

export interface ResolvedPage {
  page: PageEntry;
  /** 是否发生了语言回退（未命中所请求语言） */
  fallback: boolean;
}

/**
 * 按回退链「当前语言 → en → 默认语言（网站主语言）→ 任一可用版本」解析页面。
 * 所有语言都没有该 slug 时返回 null。
 */
export function resolvePageForLang(
  pages: PageEntry[],
  slug: string,
  lang: string,
  defaultLang: string
): ResolvedPage | null {
  const candidates = pages.filter((p) => p.slug === slug);
  if (candidates.length === 0) return null;
  const chain = [...new Set([lang, 'en', defaultLang])];
  for (const l of chain) {
    const hit = candidates.find((p) => p.lang === l);
    if (hit) return { page: hit, fallback: hit.lang !== lang };
  }
  return { page: candidates[0], fallback: candidates[0].lang !== lang };
}
