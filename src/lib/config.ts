/**
 * data/ 配置加载层：纯 Node 实现，不依赖 Astro API，便于单测。
 * 所有函数以 data 根目录作为参数传入。
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';

/** 支持双语映射的文案字段：纯字符串（所有语言通用）或 { zh, en } 映射 */
export type LocalizedText = string | Record<string, string>;

export interface SiteConfig {
  site: {
    title: string;
    description?: string;
    language?: string;
  };
  profile: {
    name: string;
    tagline?: LocalizedText;
    avatar?: string;
    bio_page?: string;
    links?: { label: string; url: string }[];
  };
  theme?: {
    accent?: string;
    default_mode?: 'system' | 'light' | 'dark';
  };
  github: {
    username: string;
    show_contributions?: boolean;
    pinned?: { repo: string; note?: string }[];
  };
  rss?: {
    enabled?: boolean;
    block_title?: LocalizedText;
    sources_file?: string;
  };
  home?: {
    layout?: { block: string; id?: string }[];
  };
  streaming_blocks?: {
    id: string;
    title?: LocalizedText;
    content_file: string;
    autoplay?: boolean;
    speed?: number;
  }[];
}

export interface RssSource {
  name: string;
  url: string;
  mode: 'latest' | 'curated';
  latest?: number;
  weight?: number;
  cover?: string;
  articles?: { url: string; note?: string; cover?: string }[];
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

export function loadSiteConfig(dataDir: string): SiteConfig {
  const file = path.join(dataDir, 'site.yaml');
  const cfg = readYaml(file) as SiteConfig;
  requireField(cfg, 'site.title', file);
  requireField(cfg, 'profile.name', file);
  requireField(cfg, 'github.username', file);
  return cfg;
}

export function loadRssConfig(dataDir: string, file = 'rss.yaml'): RssConfig {
  const filePath = path.join(dataDir, file);
  const cfg = readYaml(filePath) as RssConfig;
  if (!Array.isArray(cfg.sources) || cfg.sources.length === 0) {
    throw new Error(`${file} 的 sources 不能为空（${filePath}）`);
  }
  for (const [i, src] of cfg.sources.entries()) {
    requireField(src, 'name', `${filePath} sources[${i}]`);
    requireField(src, 'url', `${filePath} sources[${i}]`);
    if (src.mode !== 'latest' && src.mode !== 'curated') {
      throw new Error(
        `${file} sources[${i}]（${src.name}）的 mode 必须是 latest 或 curated，当前为：${src.mode}`
      );
    }
  }
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
      const base = file.replace(/\.md$/, '');
      const slug = (data.slug as string | undefined) ?? (base === 'index' ? '/' : base);
      pages.push({
        lang,
        slug,
        title: data.title as string,
        nav: (data.nav as boolean | undefined) ?? true,
        order: data.order as number | undefined,
        description: data.description as string | undefined,
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

/**
 * 双语映射解析：纯字符串原样返回；{ zh, en } 映射按语言取值，
 * 缺 key 回退 en → zh → 任意可用值。
 */
export function resolveText(field: LocalizedText, lang: string): string {
  if (typeof field === 'string') return field;
  const value = field[lang] ?? field.en ?? field.zh ?? Object.values(field)[0];
  return value ?? '';
}

export interface ResolvedPage {
  page: PageEntry;
  /** 是否发生了语言回退（未命中所请求语言） */
  fallback: boolean;
}

/**
 * 按回退链「当前语言 → en → 默认语言 → 任一可用版本」解析页面。
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
  const chain = [lang, 'en', defaultLang];
  for (const l of chain) {
    const hit = candidates.find((p) => p.lang === l);
    if (hit) return { page: hit, fallback: hit.lang !== lang };
  }
  return { page: candidates[0], fallback: candidates[0].lang !== lang };
}
