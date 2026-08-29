import { describe, expect, it } from 'vitest';
import {
  selectFeedItems,
  buildRssFeed,
  buildAtomFeed,
  buildJsonFeed,
  absolutizeUrls,
} from '../src/lib/feed.ts';
import type { PageEntry } from '../src/lib/config.ts';

const pages: PageEntry[] = [
  {
    lang: 'zh', slug: '/', title: 'Home', nav: true, body: '', filePath: '',
    date: '2026-08-01', feedEnabled: true,
  },
  {
    lang: 'zh', slug: '/research', title: '研究 & 系统', nav: true, body: '', filePath: '',
    date: '2026-08-20', updated: '2026-08-29', description: '研究描述', feedEnabled: true,
  },
  {
    lang: 'en', slug: '/research', title: 'Research', nav: true, body: '', filePath: '',
    date: '2026-08-20', feedEnabled: true,
  },
  {
    lang: 'zh', slug: '/private', title: 'Private', nav: false, body: '', filePath: '',
    date: '2026-08-28', feedEnabled: false,
  },
];

describe('feed item selection', () => {
  it('excludes home/private, sorts newest first, and keeps only real language versions', () => {
    const items = selectFeedItems(pages, { lang: 'zh', defaultLang: 'zh', limit: 20, includeHome: false });
    expect(items.map((i) => i.slug)).toEqual(['/research']);
    expect(selectFeedItems(pages, { lang: 'en', defaultLang: 'zh', limit: 20, includeHome: false }).map((i) => i.title)).toEqual(['Research']);
  });

  it('respects limit and includeHome', () => {
    expect(selectFeedItems(pages, { lang: 'zh', defaultLang: 'zh', limit: 1, includeHome: false }).map((i) => i.slug)).toEqual(['/research']);
    expect(selectFeedItems(pages, { lang: 'zh', defaultLang: 'zh', limit: 20, includeHome: true }).map((i) => i.slug)).toEqual(['/research', '/']);
  });
});

describe('feed rendering', () => {
  const options = { siteTitle: 'OpenHomepage V2', baseUrl: 'https://example.com/base/', lang: 'zh', updated: new Date('2026-08-29T08:00:00Z') };
  const selected = selectFeedItems(pages, { lang: 'zh', defaultLang: 'zh', limit: 20, includeHome: false });

  it('renders valid RSS with escaped values and localized paths', () => {
    const xml = buildRssFeed(selected, options);
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('https://example.com/base/research');
    expect(xml).toContain('<![CDATA[研究 & 系统]]>');
    expect(xml).not.toContain('<script>');
  });

  it('renders Atom 1.0', () => {
    const xml = buildAtomFeed(selected, options);
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom"');
    expect(xml).toContain('<link href="https://example.com/base/research"/>');
  });

  it('renders JSON Feed 1.1', () => {
    const json = buildJsonFeed(selected, options);
    const parsed = JSON.parse(json);
    expect(parsed.version).toContain('https://jsonfeed.org/version/1.1');
    expect(parsed.items[0].title).toBe('研究 & 系统');
  });

  it('absolutizes src and href after markdown rendering', () => {
    expect(absolutizeUrls('<img src="/assets/a.jpg"><a href="/research"></a>', 'https://example.com/base/')).toBe('<img src="https://example.com/base/assets/a.jpg"><a href="https://example.com/base/research"></a>');
  });
});

