import path from 'node:path';
import { existsSync } from 'node:fs';
import { loadPages, loadSiteConfig, resolveText, type PageEntry } from './config.ts';
import { normalizeLang, pageUrlPath } from './routes.ts';
import { normalizeFeedConfig, selectFeedItems, buildRssFeed, buildAtomFeed, buildJsonFeed, absolutizeUrls, type FeedItem } from './feed.ts';
import { resolveDataDir } from './data-dir.ts';
import { renderMarkdown } from './markdown.ts';
import { loadPublications } from './publications.ts';
import { getBaseUrl } from './base-url.ts';

export type FeedFormat = 'rss' | 'atom' | 'json';

export async function buildFeedDocument(
  format: FeedFormat,
  options: { siteUrl?: URL | string; requestedLang?: string } = {},
): Promise<string | null> {
  const dataDir = resolveDataDir(process.cwd());
  const site = loadSiteConfig(dataDir);
  const pages = loadPages(dataDir);
  const langs = [...new Set(pages.map((p) => p.lang))];
  const defaultLang = normalizeLang(site.site.language) ?? langs[0] ?? 'zh';
  const lang = options.requestedLang ?? defaultLang;
  if (!langs.includes(lang)) return null;
  const cfg = normalizeFeedConfig(site.feed);
  if (!cfg.enabled || !cfg.formats.includes(format)) return null;
  const baseRoot = options.siteUrl ? new URL(getBaseUrl(), options.siteUrl).toString() : getBaseUrl();
  const selected = selectFeedItems(pages, {
    lang,
    defaultLang,
    limit: cfg.limit,
    includeHome: cfg.include_home,
  });
  const publications = existsSync(path.join(dataDir, 'publications.yaml'))
    ? loadPublications(dataDir)
    : undefined;
  const rendered: FeedItem[] = [];
  for (const item of selected) {
    const bodyHtml = await renderMarkdown(item.body, {
      baseUrl: getBaseUrl(),
      lang: item.lang,
      defaultLang,
      ...(publications?.enabled === false ? {} : publications ? { publications } : {}),
    });
    rendered.push({ ...item, body: absolutizeUrls(bodyHtml, baseRoot) });
  }
  const feedOptions = {
    siteTitle: resolveText(site.site.title, lang, defaultLang),
    description: site.site.description ? resolveText(site.site.description, lang, defaultLang) : undefined,
    baseUrl: baseRoot,
    lang,
    defaultLang,
    updated: new Date(),
  };
  if (format === 'rss') return buildRssFeed(rendered, feedOptions);
  if (format === 'atom') return buildAtomFeed(rendered, feedOptions);
  return buildJsonFeed(rendered, feedOptions);
}

export function feedLangParams(pages: PageEntry[], defaultLanguage: string | undefined): string[] {
  const defaultLang = normalizeLang(defaultLanguage) ?? 'zh';
  return [...new Set(pages.map((p) => p.lang))].filter((lang) => lang !== defaultLang);
}

export function feedPathFor(lang: string, defaultLang: string, format: FeedFormat): string {
  const file = format === 'rss' ? 'feed.xml' : format === 'atom' ? 'feed.atom.xml' : 'feed.json';
  return pageUrlPath('/', lang, defaultLang).replace(/\/$/, '') + '/' + file;
}
