/**
 * 路由与导航的纯函数层：URL 生成、getStaticPaths 路由表、导航项、备选语言链接。
 * 规则见 docs/specs/11-i18n.md：默认语言无前缀，其他语言带 /lang/ 前缀，回退链见 config.ts。
 */
import type { PageEntry } from './config.ts';
import { isI18nEnabled, resolvePageForLang } from './config.ts';

/** site.language（如 zh-CN）归一化为页面目录语言码（zh） */
export function normalizeLang(language?: string): string | undefined {
  if (!language) return undefined;
  return language.split(/[-_]/)[0].toLowerCase();
}

/** 页面 URL：默认语言无前缀（/、/research），其他语言带前缀（/en/、/en/research） */
export function pageUrlPath(slug: string, lang: string, defaultLang: string): string {
  const prefix = lang === defaultLang ? '' : `/${lang}`;
  return slug === '/' ? `${prefix}/` : `${prefix}/${slug}`;
}

/** 对应的 Astro 动态路由 param（[...slug]：根路径为 undefined） */
export function paramForSlug(slug: string, lang: string, defaultLang: string): string | undefined {
  const p = pageUrlPath(slug, lang, defaultLang).replace(/^\/+|\/+$/g, '');
  return p === '' ? undefined : p;
}

export interface RouteEntry {
  /** Astro getStaticPaths 的 params.slug */
  param: string | undefined;
  /** 完整 URL 路径（尾部规则与 Astro directory 输出一致） */
  path: string;
  /** URL 声明的语言（前缀语言） */
  lang: string;
  /** 页面 slug（'/' 或 'research' 等） */
  slug: string;
  /** 实际渲染的页面内容（可能经回退链来自其他语言） */
  page: PageEntry;
  /** 内容语言 ≠ URL 语言 */
  fallback: boolean;
}

/**
 * 生成全站路由表。
 * i18n 启用：langs × 全部 slug 的笛卡尔积，缺失译文按回退链解析（URL 不变，标 fallback）。
 * 单语言站点：每个页面一条无前缀路由，零 i18n 开销。
 * defaultLang 不在页面语言中时回退为 langs[0]（保证默认语言始终无前缀且存在）。
 */
export function buildRoutes(pages: PageEntry[], langs: string[], defaultLang: string): RouteEntry[] {
  if (!isI18nEnabled(langs)) {
    return pages.map((page) => ({
      param: paramForSlug(page.slug, page.lang, page.lang),
      path: pageUrlPath(page.slug, page.lang, page.lang),
      lang: page.lang,
      slug: page.slug,
      page,
      fallback: false,
    }));
  }
  const effectiveDefault = langs.includes(defaultLang) ? defaultLang : langs[0];
  const slugs = [...new Set(pages.map((p) => p.slug))];
  const routes: RouteEntry[] = [];
  for (const lang of langs) {
    for (const slug of slugs) {
      const resolved = resolvePageForLang(pages, slug, lang, effectiveDefault);
      if (!resolved) continue;
      routes.push({
        param: paramForSlug(slug, lang, effectiveDefault),
        path: pageUrlPath(slug, lang, effectiveDefault),
        lang,
        slug,
        page: resolved.page,
        fallback: resolved.fallback,
      });
    }
  }
  return routes;
}

export interface NavItem {
  slug: string;
  title: string;
  path: string;
}

/**
 * 某语言的导航项：nav=true 页面按 order 升序（loadPages 已排序，取各 slug 首次出现），
 * 标题经回退链解析，URL 使用当前语言前缀。
 */
export function navPagesForLang(pages: PageEntry[], lang: string, defaultLang: string): NavItem[] {
  const seen = new Set<string>();
  const items: NavItem[] = [];
  for (const p of pages) {
    if (seen.has(p.slug)) continue;
    seen.add(p.slug);
    const resolved = resolvePageForLang(pages, p.slug, lang, defaultLang);
    if (!resolved || !resolved.page.nav) continue;
    items.push({
      slug: p.slug,
      title: resolved.page.title,
      path: pageUrlPath(p.slug, lang, defaultLang),
    });
  }
  return items;
}

/**
 * 当前页真实存在的语言版本链接（hreflang 与语言切换器共用）；
 * 只统计该 slug 在对应语言有真实页面的语言（回退渲染不算），
 * 单语言站点或该页无真实他语言版本时返回空/单元素 → 切换器不显示（spec 11）。
 */
export function alternateLinks(
  pages: PageEntry[],
  slug: string,
  langs: string[],
  defaultLang: string,
): { lang: string; path: string }[] {
  if (!isI18nEnabled(langs)) return [];
  const effectiveDefault = langs.includes(defaultLang) ? defaultLang : langs[0];
  const realLangs = new Set(pages.filter((p) => p.slug === slug).map((p) => p.lang));
  return langs
    .filter((lang) => realLangs.has(lang))
    .map((lang) => ({ lang, path: pageUrlPath(slug, lang, effectiveDefault) }));
}

/**
 * 把内容里声明的无语言站内链接（如 /research）改写为当前路由语言。
 * 只改写已知页面 slug：静态资源、外链、锚点、未识别路径保持原样；
 * 已带语言前缀的链接不重复改写。
 */
export function localizeInternalHref(
  href: string,
  lang: string,
  defaultLang: string,
  slugs: ReadonlySet<string>
): string {
  if (lang === defaultLang || !href || !href.startsWith('/') || href.startsWith('//')) return href;
  const base = 'https://openhomepage.local';
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return href;
  }
  if (url.origin !== base) return href;

  const trailingSlash = url.pathname.length > 1 && url.pathname.endsWith('/');
  const cleanPath = url.pathname.replace(/\/+$/, '');
  const slug = cleanPath === '' ? '/' : cleanPath.slice(1);
  if (!slugs.has(slug)) return href;

  const pathname = slug === '/' ? `/${lang}/` : `/${lang}/${slug}${trailingSlash ? '/' : ''}`;
  return `${pathname}${url.search}${url.hash}`;
}
