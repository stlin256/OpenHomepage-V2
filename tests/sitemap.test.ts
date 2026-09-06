import { describe, it, expect } from 'vitest';
import type { PageEntry, SiteConfig } from '../src/lib/config.ts';
import {
  buildSitemapEntries,
  buildSitemapXml,
  buildSitemapDocument,
  resolveAbsoluteUrl,
  formatLastmod,
  xmlEsc,
} from '../src/lib/sitemap.ts';

const mockSiteConfig: SiteConfig = {
  site: {
    title: { zh: '测试站点', en: 'Test Site' },
    language: 'zh-CN',
    url: 'https://example.com',
  },
  profile: {
    name: { zh: '张三', en: 'San Zhang' },
  },
  github: {
    username: 'testuser',
  },
  seo: {
    sitemap: {
      enabled: true,
      changefreq: 'weekly',
      priority: { home: 1.0, pages: 0.8 },
    },
  },
};

const mockPages: PageEntry[] = [
  {
    lang: 'zh',
    slug: '/',
    title: '主页',
    nav: true,
    date: '2026-09-01',
    body: '主页内容',
    filePath: 'data/pages/zh/index.md',
  },
  {
    lang: 'en',
    slug: '/',
    title: 'Home',
    nav: true,
    date: '2026-09-01',
    body: 'Home content',
    filePath: 'data/pages/en/index.md',
  },
  {
    lang: 'zh',
    slug: 'about',
    title: '关于',
    nav: true,
    date: '2026-08-20',
    updated: '2026-09-05',
    priority: 0.9,
    changefreq: 'daily',
    body: '关于我们',
    filePath: 'data/pages/zh/about.md',
  },
  {
    lang: 'en',
    slug: 'about',
    title: 'About',
    nav: true,
    date: '2026-08-20',
    body: 'About us',
    filePath: 'data/pages/en/about.md',
  },
  {
    lang: 'zh',
    slug: 'secret',
    title: '秘密页面',
    nav: false,
    sitemap: false,
    body: '保密',
    filePath: 'data/pages/zh/secret.md',
  },
];

describe('sitemap utility functions', () => {
  it('xmlEsc properly escapes XML characters', () => {
    expect(xmlEsc('a < b & c > d "e" \'f\'')).toBe('a &lt; b &amp; c &gt; d &quot;e&quot; &apos;f&apos;');
  });

  it('resolveAbsoluteUrl resolves full URL with domain and base', () => {
    expect(resolveAbsoluteUrl('/', 'https://stlin256.github.io', '/OpenHomepage-V2')).toBe(
      'https://stlin256.github.io/OpenHomepage-V2/'
    );
    expect(resolveAbsoluteUrl('/en/', 'https://stlin256.github.io', '/OpenHomepage-V2')).toBe(
      'https://stlin256.github.io/OpenHomepage-V2/en/'
    );
    expect(resolveAbsoluteUrl('/about', 'https://example.com/', '/')).toBe('https://example.com/about');
    expect(resolveAbsoluteUrl('about', 'https://example.com')).toBe('https://example.com/about');
  });

  it('formatLastmod extracts valid date or fallbacks', () => {
    expect(formatLastmod('2026-09-06T12:00:00Z')).toBe('2026-09-06');
    expect(formatLastmod('2026-08-15')).toBe('2026-08-15');
    const fallback = new Date('2026-01-01');
    expect(formatLastmod('invalid-date', 'non-existent-file.md', fallback)).toBe('2026-01-01');
    expect(formatLastmod(undefined, 'non-existent-file.md', fallback)).toBe('2026-01-01');
  });
});

describe('buildSitemapEntries', () => {
  it('generates multi-language sitemap entries with alternates and x-default', () => {
    const entries = buildSitemapEntries(mockPages, mockSiteConfig, {
      siteUrl: 'https://example.com',
      baseUrl: '/',
    });

    // 2 home routes (zh, en) + 2 about routes (zh, en) = 4 routes (secret is excluded)
    expect(entries.length).toBe(4);

    const zhHome = entries.find((e) => e.loc === 'https://example.com/');
    expect(zhHome).toBeDefined();
    expect(zhHome?.priority).toBe('1.0');
    expect(zhHome?.changefreq).toBe('weekly');
    expect(zhHome?.lastmod).toBe('2026-09-01');
    expect(zhHome?.alternates).toEqual([
      { lang: 'en', href: 'https://example.com/en/' },
      { lang: 'zh', href: 'https://example.com/' },
      { lang: 'x-default', href: 'https://example.com/' },
    ]);

    const zhAbout = entries.find((e) => e.loc === 'https://example.com/about');
    expect(zhAbout).toBeDefined();
    expect(zhAbout?.priority).toBe('0.9');
    expect(zhAbout?.changefreq).toBe('daily');
    expect(zhAbout?.lastmod).toBe('2026-09-05'); // updated overrides date

    // Verify secret is excluded
    expect(entries.find((e) => e.loc.includes('secret'))).toBeUndefined();
  });

  it('returns empty array when sitemap is disabled', () => {
    const disabledConfig: SiteConfig = {
      ...mockSiteConfig,
      seo: { sitemap: { enabled: false } },
    };
    const entries = buildSitemapEntries(mockPages, disabledConfig);
    expect(entries).toEqual([]);
  });

  it('supports single language site without alternates', () => {
    const singleLangPages: PageEntry[] = [
      {
        lang: 'zh',
        slug: '/',
        title: '主页',
        nav: true,
        date: '2026-09-01',
        body: '主页',
        filePath: 'data/pages/zh/index.md',
      },
    ];
    const entries = buildSitemapEntries(singleLangPages, mockSiteConfig, {
      siteUrl: 'https://example.com',
    });
    expect(entries.length).toBe(1);
    expect(entries[0].alternates).toBeUndefined();
  });
});

describe('buildSitemapXml', () => {
  it('generates valid XML string with xhtml namespace for i18n sites', () => {
    const xml = buildSitemapXml(mockPages, mockSiteConfig, {
      siteUrl: 'https://example.com',
      baseUrl: '/',
    });
    expect(xml).not.toBeNull();
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">');
    expect(xml).toContain('<loc>https://example.com/</loc>');
    expect(xml).toContain('<xhtml:link rel="alternate" hreflang="zh" href="https://example.com/" />');
    expect(xml).toContain('<xhtml:link rel="alternate" hreflang="x-default" href="https://example.com/" />');
    expect(xml).toContain('</urlset>');
  });

  it('returns null when sitemap is disabled', () => {
    const disabledConfig: SiteConfig = {
      ...mockSiteConfig,
      seo: { sitemap: { enabled: false } },
    };
    expect(buildSitemapXml(mockPages, disabledConfig)).toBeNull();
  });

  it('buildSitemapDocument works with default project data', async () => {
    const doc = await buildSitemapDocument({ siteUrl: 'https://example.com' });
    expect(doc).not.toBeNull();
    expect(doc).toContain('<urlset');
    expect(doc).toContain('https://example.com');
  });
});
