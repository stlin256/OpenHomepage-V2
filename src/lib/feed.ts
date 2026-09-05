/** P0 本站原创内容 Feed：页面筛选与 RSS 2.0 / Atom 1.0 / JSON Feed 1.1 纯函数生成。 */
import type { PageEntry } from './config.ts';
import { pageUrlPath } from './routes.ts';

export interface FeedConfig {
  enabled?: boolean;
  formats?: ('rss' | 'atom' | 'json')[];
  limit?: number;
  include_home?: boolean;
}

export interface FeedItem extends PageEntry {
  path: string;
  absoluteUrl: string;
  published: Date;
  updatedDate?: Date;
}

export interface FeedOptions {
  siteTitle: string;
  baseUrl: string;
  lang: string;
  defaultLang?: string;
  updated?: Date;
  description?: string;
}

export function normalizeFeedConfig(cfg: FeedConfig | undefined): Required<Omit<FeedConfig, 'formats'>> & { formats: ('rss' | 'atom' | 'json')[]; enabled: boolean } {
  const formats = cfg?.formats?.filter((v): v is 'rss' | 'atom' | 'json' => ['rss', 'atom', 'json'].includes(v)) ?? ['rss', 'atom'];
  return {
    enabled: cfg?.enabled !== false,
    formats: formats.length ? [...new Set(formats)] : ['rss', 'atom'],
    limit: Math.min(200, Math.max(1, Number.isInteger(cfg?.limit) ? cfg!.limit! : 50)),
    include_home: cfg?.include_home === true,
  };
}

export function selectFeedItems(
  pages: PageEntry[],
  options: { lang: string; defaultLang: string; limit?: number; includeHome?: boolean }
): FeedItem[] {
  const limit = options.limit && options.limit > 0 ? options.limit : 50;
  const candidates = pages.filter((page) => {
    if (page.lang !== options.lang) return false;
    if (page.feedEnabled === false) return false;
    if (!page.date && !page.updated) return false;
    if (page.slug === '/' && options.includeHome !== true) return false;
    return true;
  });
  return candidates
    .map((page) => {
      const path = pageUrlPath(page.slug, page.lang, options.defaultLang);
      const publishedRaw = page.date ?? page.updated!;
      const published = new Date(publishedRaw);
      return {
        ...page,
        path,
        absoluteUrl: path,
        published,
        updatedDate: page.updated ? new Date(page.updated) : undefined,
      };
    })
    .filter((item) => !Number.isNaN(item.published.getTime()))
    .sort((a, b) => b.published.getTime() - a.published.getTime() || a.slug.localeCompare(b.slug))
    .slice(0, limit);
}

function absoluteUrl(baseUrl: string, path: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const cleanPath = path.replace(/^\/+/, '');
  return cleanPath ? cleanBase + '/' + cleanPath : cleanBase + '/';
}

function withBaseUrls(items: FeedItem[], baseUrl: string): FeedItem[] {
  return items.map((item) => ({ ...item, absoluteUrl: absoluteUrl(baseUrl, item.path) }));
}

function iso(date: Date): string {
  return date.toISOString();
}

function xmlEsc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, ']]&gt;')}]]>`;
}

function feedDescription(item: PageEntry, language: string): string {
  if (item.description) return item.description;
  const text = item.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return [...text].slice(0, 300).join('');
}

export function absolutizeUrls(html: string, baseUrl: string): string {
  return html
    .replace(/(\s(?:src|href)=["'])(\/[^"']*)(["'])/g, (_m, before: string, path: string, after: string) => `${before}${absoluteUrl(baseUrl, path)}${after}`)
    .replace(/(\s(?:src|href)=["'])(assets\/[^"']*)(["'])/g, (_m, before: string, path: string, after: string) => `${before}${absoluteUrl(baseUrl, `/${path}`)}${after}`);
}

export function buildRssFeed(items: FeedItem[], options: FeedOptions): string {
  const items2 = withBaseUrls(items, options.baseUrl);
  const updated = options.updated ?? new Date();
  const entries = items2.map((item) => `    <item>
      <title>${cdata(item.title)}</title>
      <link>${xmlEsc(item.absoluteUrl)}</link>
      <guid isPermaLink="true">${xmlEsc(item.absoluteUrl)}</guid>
      <pubDate>${item.published.toUTCString()}</pubDate>
      ${item.updatedDate ? `<atom:updated>${iso(item.updatedDate)}</atom:updated>` : ''}
      <description>${cdata(feedDescription(item, options.lang))}</description>
      <content:encoded>${cdata(item.body)}</content:encoded>
      <dc:language>${xmlEsc(item.lang)}</dc:language>
    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${cdata(options.siteTitle)}</title>
    <link>${xmlEsc(absoluteUrl(options.baseUrl, '/'))}</link>
    <description>${cdata(options.description ?? options.siteTitle)}</description>
    <language>${xmlEsc(options.lang)}</language>
    <lastBuildDate>${updated.toUTCString()}</lastBuildDate>
    <atom:link rel="self" type="application/rss+xml" href="${xmlEsc(absoluteUrl(options.baseUrl, options.lang === options.defaultLang ? '/feed.xml' : `/${options.lang}/feed.xml`))}"/>
${entries}
  </channel>
</rss>`;
}

export function buildAtomFeed(items: FeedItem[], options: FeedOptions): string {
  const items2 = withBaseUrls(items, options.baseUrl);
  const updated = options.updated ?? new Date();
  const entries = items2.map((item) => `    <entry>
      <title>${xmlEsc(item.title)}</title>
      <id>${xmlEsc(item.absoluteUrl)}</id>
      <link href="${xmlEsc(item.absoluteUrl)}"/>
      <published>${iso(item.published)}</published>
      <updated>${iso(item.updatedDate ?? item.published)}</updated>
      <summary>${xmlEsc(feedDescription(item, options.lang))}</summary>
      <content type="html">${xmlEsc(item.body)}</content>
    </entry>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${xmlEsc(options.lang)}">
  <title>${xmlEsc(options.siteTitle)}</title>
  <id>${xmlEsc(absoluteUrl(options.baseUrl, '/'))}</id>
  <updated>${iso(updated)}</updated>
  <link rel="self" href="${xmlEsc(absoluteUrl(options.baseUrl, options.lang === options.defaultLang ? '/feed.atom.xml' : `/${options.lang}/feed.atom.xml`))}"/>
${entries}
</feed>`;
}

export function buildJsonFeed(items: FeedItem[], options: FeedOptions): string {
  const items2 = withBaseUrls(items, options.baseUrl);
  return JSON.stringify({
    version: 'https://jsonfeed.org/version/1.1',
    title: options.siteTitle,
    home_page_url: absoluteUrl(options.baseUrl, '/'),
    feed_url: absoluteUrl(options.baseUrl, options.lang === options.defaultLang ? '/feed.json' : `/${options.lang}/feed.json`),
    language: options.lang,
    description: options.description ?? options.siteTitle,
    items: items2.map((item) => ({
      id: item.absoluteUrl,
      url: item.absoluteUrl,
      title: item.title,
      content_html: absolutizeUrls(item.body, options.baseUrl),
      summary: feedDescription(item, options.lang),
      date_published: iso(item.published),
      ...(item.updatedDate ? { date_modified: iso(item.updatedDate) } : {}),
      language: item.lang,
    })),
  }, null, 2);
}



