/**
 * spec 23: 自动化 Sitemap XML 生成器（纯函数层）
 * 支持多语言 xhtml:link 双向关联、x-default 回退与页面级 sitemap 控制。
 */
import { statSync } from 'node:fs';
import type { PageEntry, SiteConfig } from './config.ts';
import { detectLanguages, isI18nEnabled, loadPages, loadSiteConfig } from './config.ts';
import { buildRoutes, normalizeLang, pageUrlPath } from './routes.ts';
import { resolveDataDir } from './data-dir.ts';
import { getBaseUrl } from './base-url.ts';

export interface SitemapAlternate {
  lang: string;
  href: string;
}

export interface SitemapEntry {
  loc: string;
  lastmod: string;
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: string;
  alternates?: SitemapAlternate[];
}

export interface SitemapOptions {
  siteUrl?: string | URL;
  baseUrl?: string;
  now?: Date;
}

export function xmlEsc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function resolveAbsoluteUrl(path: string, siteUrl?: string | URL, baseUrl?: string): string {
  const domain = siteUrl
    ? (typeof siteUrl === 'string' ? siteUrl : siteUrl.toString()).replace(/\/+$/, '')
    : 'https://example.com';
  const base = (baseUrl ?? getBaseUrl()).replace(/^\/*/, '/').replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (!base || base === '/') {
    return `${domain}${cleanPath}`;
  }
  return `${domain}${base}${cleanPath}`;
}

export function formatLastmod(dateStr?: string, filePath?: string, fallbackDate?: Date): string {
  if (dateStr) {
    const d = new Date(dateStr);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  }
  if (filePath) {
    try {
      const stat = statSync(filePath);
      return stat.mtime.toISOString().split('T')[0];
    } catch {
      // 文件在测试或内存环境中可能不存在，静默跳过
    }
  }
  return (fallbackDate ?? new Date()).toISOString().split('T')[0];
}

export function buildSitemapEntries(
  pages: PageEntry[],
  site: SiteConfig,
  options: SitemapOptions = {}
): SitemapEntry[] {
  const seo = site.seo?.sitemap;
  if (seo?.enabled === false) return [];

  const langs = detectLanguages(pages);
  const defaultLang = normalizeLang(site.site.language) ?? langs[0] ?? 'zh';
  const i18n = isI18nEnabled(langs);
  const routes = buildRoutes(pages, langs, defaultLang);

  // 过滤显式声明排除 sitemap 的页面
  const validRoutes = routes.filter((r) => r.page.sitemap !== false);

  const defaultPriorityHome = seo?.priority?.home ?? 1.0;
  const defaultPriorityPages = seo?.priority?.pages ?? 0.8;
  const defaultChangefreq = seo?.changefreq ?? 'weekly';

  const entries: SitemapEntry[] = [];

  for (const route of validRoutes) {
    const loc = resolveAbsoluteUrl(route.path, options.siteUrl ?? site.site.url, options.baseUrl);
    const lastmod = formatLastmod(route.page.updated ?? route.page.date, route.page.filePath, options.now);
    const changefreq = route.page.changefreq ?? defaultChangefreq;
    const rawPriority = route.page.priority ?? (route.slug === '/' ? defaultPriorityHome : defaultPriorityPages);
    const priority = Math.max(0, Math.min(1, rawPriority)).toFixed(1);

    let alternates: SitemapAlternate[] | undefined;
    if (i18n) {
      alternates = [];
      for (const lang of langs) {
        const altPath = pageUrlPath(route.slug, lang, defaultLang);
        alternates.push({
          lang,
          href: resolveAbsoluteUrl(altPath, options.siteUrl ?? site.site.url, options.baseUrl),
        });
      }
      alternates.push({
        lang: 'x-default',
        href: resolveAbsoluteUrl(pageUrlPath(route.slug, defaultLang, defaultLang), options.siteUrl ?? site.site.url, options.baseUrl),
      });
    }

    entries.push({
      loc,
      lastmod,
      changefreq,
      priority,
      alternates,
    });
  }

  return entries;
}

export function buildSitemapXml(
  pages: PageEntry[],
  site: SiteConfig,
  options: SitemapOptions = {}
): string | null {
  const seo = site.seo?.sitemap;
  if (seo?.enabled === false) return null;

  const entries = buildSitemapEntries(pages, site, options);
  const langs = detectLanguages(pages);
  const i18n = isI18nEnabled(langs);

  const urlElements = entries.map((entry) => {
    const altXml = entry.alternates && entry.alternates.length > 0
      ? entry.alternates
          .map((alt) => `    <xhtml:link rel="alternate" hreflang="${xmlEsc(alt.lang)}" href="${xmlEsc(alt.href)}" />`)
          .join('\n') + '\n'
      : '';

    return `  <url>
    <loc>${xmlEsc(entry.loc)}</loc>
    <lastmod>${xmlEsc(entry.lastmod)}</lastmod>
    <changefreq>${xmlEsc(entry.changefreq)}</changefreq>
    <priority>${xmlEsc(entry.priority)}</priority>
${altXml}  </url>`;
  });

  const xmlnsXhtml = i18n ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${xmlnsXhtml}>
${urlElements.join('\n')}
</urlset>
`;
}

export async function buildSitemapDocument(options: SitemapOptions = {}): Promise<string | null> {
  const dataDir = resolveDataDir(process.cwd());
  const site = loadSiteConfig(dataDir);
  const pages = loadPages(dataDir);
  return buildSitemapXml(pages, site, options);
}
