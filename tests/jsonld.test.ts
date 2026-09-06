import { describe, it, expect } from 'vitest';
import type { PageEntry, SiteConfig } from '../src/lib/config.ts';
import type { PublicationsConfig } from '../src/lib/publications.ts';
import {
  serializeJsonLd,
  stripMarkdownAndHtml,
  buildWebSiteSchema,
  buildPersonSchema,
  buildScholarlyArticleSchema,
  buildArticleSchema,
  buildPageJsonLd,
  buildPageJsonLdString,
  resolveAvatarFullUrl,
} from '../src/lib/jsonld.ts';

const mockSiteConfig: SiteConfig = {
  site: {
    title: { zh: '知远的主页', en: "Zhiyuan's Homepage" },
    description: { zh: '关于机器学习与系统的个人主页', en: 'Personal homepage on ML and systems' },
    language: 'zh-CN',
    url: 'https://example.com',
  },
  profile: {
    name: { zh: '林知远', en: 'Zhiyuan Lin' },
    tagline: { zh: '博士生 / 系统研究', en: 'PhD Student / Systems' },
    avatar: 'assets/avatar.jpg',
    links: [
      { label: 'Google Scholar', url: 'https://scholar.google.com/citations?user=123' },
      { label: 'Email', url: 'mailto:zhiyuan@example.com' },
      { label: 'Invalid', url: 'invalid-url' },
    ],
  },
  github: {
    username: 'stlin256',
  },
};

const mockPublications: PublicationsConfig = {
  enabled: true,
  items: [
    {
      id: 'paper-2026',
      title: 'Adaptive Distributed Inference',
      authors: ['Zhiyuan Lin', 'Alice Smith', 'Bob Jones'],
      year: 2026,
      date: '2026-05-15',
      type: 'conference',
      venue: 'OSDI 2026',
      doi: '10.1145/1234567.890123',
      tags: ['MLSys', 'Distributed Systems'],
      note: { zh: '一作论文', en: 'First-author paper' },
      abstract: { zh: '提出自适应调度框架...', en: 'We propose an adaptive scheduling...' },
      links: { pdf: 'https://arxiv.org/pdf/2605.12345.pdf' },
    },
    {
      id: 'journal-2025',
      title: 'Memory Optimization in LLMs',
      authors: ['Alice Smith', 'Zhiyuan Lin'],
      year: 2025,
      type: 'journal',
      venue: 'IEEE TPDS',
      doi: 'https://doi.org/10.1109/TPDS.2025.01',
      tags: ['LLM', 'Memory'],
      links: { arxiv: 'https://arxiv.org/abs/2501.00000' },
    },
    {
      id: 'preprint-2024',
      title: 'Minimal Preprint',
      authors: ['Zhiyuan Lin'],
      year: 2024,
      venue: 'arXiv:2401.00000',
      type: 'preprint',
      links: { project: 'https://example.com/project' },
    },
  ],
};

const mockHomePage: PageEntry = {
  lang: 'zh',
  slug: '/',
  title: '首页',
  nav: true,
  body: '欢迎来到我的主页',
  filePath: 'data/pages/zh/index.md',
};

const mockPostPage: PageEntry = {
  lang: 'zh',
  slug: 'posts/hello',
  title: '你好世界',
  nav: false,
  date: '2026-09-01T10:00:00Z',
  updated: '2026-09-02T12:00:00Z',
  type: 'post',
  description: '第一篇博文',
  body: '# 标题\n\n这是正文内容，带有 [链接](https://example.com) 和 **加粗**。',
  filePath: 'data/pages/zh/posts/hello.md',
};

describe('jsonld utility functions', () => {
  it('serializeJsonLd strictly escapes dangerous XSS script tags and Unicode line terminators', () => {
    const malicious = {
      title: '</script><script>alert("xss")</script>',
      special: 'line\u2028sep\u2029para & <tag>',
    };
    const serialized = serializeJsonLd(malicious);
    expect(serialized).not.toContain('</script>');
    expect(serialized).not.toContain('<tag>');
    expect(serialized).toContain('\\u003c/script\\u003e');
    expect(serialized).toContain('\\u0026');
    expect(serialized).toContain('\\u2028');
    expect(serialized).toContain('\\u2029');
  });

  it('stripMarkdownAndHtml removes directives, html tags, markdown syntax', () => {
    const md = '## 标题\n:::note\n注意内容\n:::\n带有 <span class="tag">HTML</span> 与 [超链接](https://a.com) 以及 `代码` 与 ::bilibili{aid=123}。';
    const text = stripMarkdownAndHtml(md);
    expect(text).not.toContain('##');
    expect(text).not.toContain('<span');
    expect(text).not.toContain(':::');
    expect(text).not.toContain('::bilibili');
    expect(text).toContain('标题');
    expect(text).toContain('超链接');
    expect(text).toContain('代码');
    expect(stripMarkdownAndHtml('')).toBe('');
  });

  it('resolveAvatarFullUrl handles relative paths and full URLs', () => {
    expect(resolveAvatarFullUrl('assets/avatar.jpg', 'https://example.com', '/')).toBe('https://example.com/assets/avatar.jpg');
    expect(resolveAvatarFullUrl('/assets/avatar.jpg', 'https://example.com', '/')).toBe('https://example.com/assets/avatar.jpg');
    expect(resolveAvatarFullUrl('https://cdn.example.com/a.png', 'https://example.com')).toBe('https://cdn.example.com/a.png');
    expect(resolveAvatarFullUrl(undefined)).toBeUndefined();
  });
});

describe('Schema Builders', () => {
  it('buildWebSiteSchema generates WebSite entity with localized metadata', () => {
    const zh = buildWebSiteSchema(mockSiteConfig, 'zh', 'zh', 'https://example.com');
    expect(zh['@type']).toBe('WebSite');
    expect(zh['name']).toBe('知远的主页');
    expect(zh['inLanguage']).toBe('zh');

    const en = buildWebSiteSchema(mockSiteConfig, 'en', 'zh', 'https://example.com');
    expect(en['name']).toBe("Zhiyuan's Homepage");
    expect(en['inLanguage']).toBe('en');

    const noDescSite: SiteConfig = {
      ...mockSiteConfig,
      site: { title: 'No Desc Site' },
    };
    const noDesc = buildWebSiteSchema(noDescSite, 'zh', 'zh', 'https://example.com');
    expect(noDesc['description']).toBeUndefined();
  });

  it('buildPersonSchema aggregates links and publication research tags', () => {
    const person = buildPersonSchema(mockSiteConfig, mockPublications, 'zh', 'zh', 'https://example.com');
    expect(person['@type']).toBe('Person');
    expect(person['name']).toBe('林知远');
    expect(person['jobTitle']).toBe('博士生 / 系统研究');
    expect(person['sameAs']).toEqual([
      'https://scholar.google.com/citations?user=123',
      'mailto:zhiyuan@example.com',
      'https://github.com/stlin256',
    ]);
    expect(person['knowsAbout']).toEqual(['MLSys', 'Distributed Systems', 'LLM', 'Memory']);

    const minimalSite: SiteConfig = {
      site: { title: 'Minimal' },
      profile: { name: 'Simple User' },
      github: { username: '' },
    };
    const minimalPerson = buildPersonSchema(minimalSite, undefined, 'zh', 'zh', 'https://example.com');
    expect(minimalPerson['name']).toBe('Simple User');
    expect(minimalPerson['jobTitle']).toBeUndefined();
    expect(minimalPerson['image']).toBeUndefined();
    expect(minimalPerson['sameAs']).toBeUndefined();
    expect(minimalPerson['knowsAbout']).toBeUndefined();
  });

  it('buildScholarlyArticleSchema handles conference and journal publications with DOI', () => {
    const conf = buildScholarlyArticleSchema(mockPublications.items[0], 'zh', 'zh', 'https://example.com');
    expect(conf['@type']).toBe('ScholarlyArticle');
    expect(conf['headline']).toBe('Adaptive Distributed Inference');
    expect(conf['author']).toEqual([
      { '@type': 'Person', name: 'Zhiyuan Lin' },
      { '@type': 'Person', name: 'Alice Smith' },
      { '@type': 'Person', name: 'Bob Jones' },
    ]);
    expect(conf['datePublished']).toBe('2026-05-15');
    expect(conf['isPartOf']).toEqual({ '@type': 'PublicationEvent', name: 'OSDI 2026' });
    expect(conf['sameAs']).toBe('https://doi.org/10.1145/1234567.890123');
    expect(conf['url']).toBe('https://arxiv.org/pdf/2605.12345.pdf');
    expect(conf['description']).toBe('一作论文');

    const journal = buildScholarlyArticleSchema(mockPublications.items[1], 'zh', 'zh', 'https://example.com');
    expect(journal['isPartOf']).toEqual({ '@type': 'Periodical', name: 'IEEE TPDS' });
    expect(journal['datePublished']).toBe('2025');
    expect(journal['sameAs']).toBe('https://doi.org/10.1109/TPDS.2025.01');
    expect(journal['url']).toBe('https://arxiv.org/abs/2501.00000');

    const preprint = buildScholarlyArticleSchema(mockPublications.items[2], 'zh', 'zh', 'https://example.com');
    expect(preprint['isPartOf']).toEqual({ '@type': 'PublicationEvent', name: 'arXiv:2401.00000' });
    expect(preprint['url']).toBe('https://example.com/project');

    const noVenueItem = { ...mockPublications.items[2], venue: '' };
    const noVenue = buildScholarlyArticleSchema(noVenueItem, 'zh', 'zh', 'https://example.com');
    expect(noVenue['isPartOf']).toBeUndefined();
  });

  it('buildArticleSchema generates BlogPosting / Article / WebPage with author association', () => {
    const post = buildArticleSchema(mockPostPage, mockSiteConfig, 'zh', 'zh', 'https://example.com', '/');
    expect(post['@type']).toBe('BlogPosting');
    expect(post['headline']).toBe('你好世界');
    expect(post['datePublished']).toBe('2026-09-01T10:00:00Z');
    expect(post['dateModified']).toBe('2026-09-02T12:00:00Z');
    expect(post['description']).toBe('第一篇博文');
    expect(post['author']).toEqual({ '@type': 'Person', name: '林知远' });

    const articlePage: PageEntry = {
      lang: 'zh',
      slug: 'research',
      title: '研究方向',
      nav: true,
      type: 'article',
      body: '详细的研究内容介绍...',
      filePath: 'data/pages/zh/research.md',
    };
    const article = buildArticleSchema(articlePage, mockSiteConfig, 'zh', 'zh', 'https://example.com');
    expect(article['@type']).toBe('Article');
    expect(article['description']).toContain('详细的研究内容介绍');

    const genericPage: PageEntry = {
      lang: 'zh',
      slug: 'about',
      title: '关于',
      nav: true,
      body: '',
      filePath: 'data/pages/zh/about.md',
    };
    const webPage = buildArticleSchema(genericPage, mockSiteConfig, 'zh', 'zh', 'https://example.com');
    expect(webPage['@type']).toBe('WebPage');
    expect(webPage['description']).toBeUndefined();
  });
});

describe('buildPageJsonLd and buildPageJsonLdString', () => {
  it('generates complete graph for homepage including ProfilePage and ScholarlyArticles', () => {
    const jsonLd = buildPageJsonLd({
      site: mockSiteConfig,
      page: mockHomePage,
      publications: mockPublications,
      lang: 'zh',
      defaultLang: 'zh',
      siteUrl: 'https://example.com',
      isHome: true,
    });

    expect(jsonLd['@context']).toBe('https://schema.org');
    const graph = jsonLd['@graph'] as Record<string, unknown>[];
    expect(graph.length).toBe(5); // WebSite + ProfilePage + 3 ScholarlyArticles

    const profilePage = graph.find((item) => item['@type'] === 'ProfilePage');
    expect(profilePage).toBeDefined();
    expect((profilePage?.['mainEntity'] as Record<string, unknown>)?.[
      'name'
    ]).toBe('林知远');
  });

  it('generates string without unescaped HTML injection', () => {
    const jsonLdStr = buildPageJsonLdString({
      site: mockSiteConfig,
      page: mockPostPage,
      lang: 'zh',
      defaultLang: 'zh',
      siteUrl: 'https://example.com',
      isHome: false,
    });

    expect(typeof jsonLdStr).toBe('string');
    expect(jsonLdStr).toContain('"@type": "BlogPosting"');
    expect(jsonLdStr).not.toContain('<');
    expect(jsonLdStr).not.toContain('>');
  });

  it('includes ScholarlyArticle for non-homepage if body contains ::publications', () => {
    const pubPage: PageEntry = {
      lang: 'zh',
      slug: 'papers',
      title: '全部论文',
      nav: true,
      body: '# 成果列表\n\n::publications',
      filePath: 'data/pages/zh/papers.md',
    };

    const jsonLd = buildPageJsonLd({
      site: mockSiteConfig,
      page: pubPage,
      publications: mockPublications,
      lang: 'zh',
      defaultLang: 'zh',
      siteUrl: 'https://example.com',
      isHome: false,
    });

    const graph = jsonLd['@graph'] as Record<string, unknown>[];
    expect(graph.length).toBe(5); // WebSite + Article + 3 ScholarlyArticles
  });
});
