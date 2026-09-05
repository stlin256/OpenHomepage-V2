/**
 * Feed 文档装配层（src/lib/feed-document.ts）单元测试：
 * 用临时 data 目录 + 打桩 process.cwd，验证 buildFeedDocument 的
 * 语言解析与回退、feed 配置短路（enabled/formats）、三种格式输出、
 * siteUrl 绝对化与 publications.yaml 注入分支；
 * 以及 feedLangParams / feedPathFor 纯函数。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildFeedDocument, feedLangParams, feedPathFor } from '../src/lib/feed-document.ts';
import type { PageEntry } from '../src/lib/config.ts';

// 首个经 renderMarkdown 的用例需初始化 Shiki 高亮器，覆盖率插桩下可能超过默认 5s 超时
vi.setConfig({ testTimeout: 20000 });

let root: string;
let dataDir: string;
let cwdSpy: ReturnType<typeof vi.spyOn>;

function writeSiteYaml(feedSection = '', opts: { language?: boolean; description?: boolean } = {}): void {
  const lines = [
    'site:',
    '  title:',
    '    zh: 测试站点',
    '    en: Test Site',
  ];
  if (opts.description !== false) lines.push('  description:', '    zh: 中文描述');
  if (opts.language !== false) lines.push('  language: zh-CN');
  lines.push('profile:', '  name: 测试者', 'github:', '  username: octocat');
  if (feedSection) lines.push(feedSection);
  writeFileSync(path.join(dataDir, 'site.yaml'), lines.join('\n') + '\n');
}

function writePage(lang: string, file: string, frontmatter: string[], body: string): void {
  const dir = path.join(dataDir, 'pages', lang);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, file), ['---', ...frontmatter, '---', '', body, ''].join('\n'));
}

/** 标准夹具：zh（默认语言）/en 双语 research 页 + zh 首页（默认不进 feed） */
function writeStandardPages(): void {
  writePage(
    'zh',
    'research.md',
    ['title: 研究方向', 'date: "2026-08-20"', 'updated: "2026-08-29"', 'description: 研究描述'],
    '正文与图片 ![示意图](/assets/pic.jpg)',
  );
  writePage('zh', 'index.md', ['title: 首页', 'date: "2026-08-01"'], '首页正文');
  writePage('en', 'research.md', ['title: Research', 'date: "2026-08-18"'], 'English body');
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'oh-feed-doc-'));
  dataDir = path.join(root, 'data');
  mkdirSync(dataDir, { recursive: true });
  cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
});

afterEach(() => {
  cwdSpy.mockRestore();
  rmSync(root, { recursive: true, force: true });
});

describe('buildFeedDocument 语言解析与配置短路', () => {
  it('默认语言生成 RSS 2.0：链接与正文图片按 siteUrl 绝对化，且排除他语言与首页', async () => {
    writeSiteYaml();
    writeStandardPages();
    const xml = await buildFeedDocument('rss', { siteUrl: 'https://example.com/base/' });
    expect(xml).not.toBeNull();
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<language>zh</language>');
    // siteUrl 子路径应被站点根替换（new URL(getBaseUrl(), siteUrl)）
    expect(xml).toContain('https://example.com/research');
    expect(xml).toContain('href="https://example.com/feed.xml"');
    expect(xml).toContain('https://example.com/assets/pic.jpg');
    // en 页面与首页（include_home 缺省 false）不进入默认语言 feed
    expect(xml).not.toContain('/en/research');
    expect(xml).not.toContain('首页');
  });

  it('requestedLang 为非默认语言时使用语言前缀链接', async () => {
    writeSiteYaml();
    writeStandardPages();
    const xml = await buildFeedDocument('rss', { siteUrl: 'https://example.com/base/', requestedLang: 'en' });
    expect(xml).not.toBeNull();
    expect(xml).toContain('https://example.com/en/research');
    expect(xml).toContain('href="https://example.com/en/feed.xml"');
    expect(xml).toContain('Test Site');
  });

  it('请求的语言在页面中不存在时返回 null', async () => {
    writeSiteYaml();
    writeStandardPages();
    expect(await buildFeedDocument('rss', { requestedLang: 'fr' })).toBeNull();
  });

  it('没有任何页面时 langs 为空，返回 null', async () => {
    writeSiteYaml();
    expect(await buildFeedDocument('rss', { siteUrl: 'https://example.com' })).toBeNull();
  });

  it('site.language 未配置时默认语言回退为页面首个语言（langs[0]）', async () => {
    writeSiteYaml('', { language: false });
    writePage('zh', 'research.md', ['title: 研究方向', 'date: "2026-08-20"'], '正文');
    const xml = await buildFeedDocument('rss', { siteUrl: 'https://example.com' });
    expect(xml).not.toBeNull();
    // zh 成为默认语言：链接无前缀
    expect(xml).toContain('https://example.com/research');
    expect(xml).not.toContain('/zh/research');
  });

  it('site.language 未配置且无任何页面时默认语言兜底 zh，仍返回 null', async () => {
    writeSiteYaml('', { language: false });
    expect(await buildFeedDocument('rss', { siteUrl: 'https://example.com' })).toBeNull();
  });

  it('feed.enabled 为 false 时返回 null', async () => {
    writeSiteYaml(['feed:', '  enabled: false'].join('\n'));
    writeStandardPages();
    expect(await buildFeedDocument('rss', { siteUrl: 'https://example.com' })).toBeNull();
  });

  it('formats 不含请求格式时返回 null；缺省 formats 仅含 rss/atom', async () => {
    writeSiteYaml(['feed:', '  formats: [rss]'].join('\n'));
    writeStandardPages();
    expect(await buildFeedDocument('atom', { siteUrl: 'https://example.com' })).toBeNull();
    expect(await buildFeedDocument('json', { siteUrl: 'https://example.com' })).toBeNull();
    expect(await buildFeedDocument('rss', { siteUrl: 'https://example.com' })).not.toBeNull();

    // 未配置 feed 段时缺省 formats = [rss, atom]，json 不在其中
    writeSiteYaml();
    expect(await buildFeedDocument('json', { siteUrl: 'https://example.com' })).toBeNull();
    expect(await buildFeedDocument('atom', { siteUrl: 'https://example.com' })).not.toBeNull();
  });
});

describe('buildFeedDocument 输出格式与选项', () => {
  it('atom 格式输出 Atom 1.0', async () => {
    writeSiteYaml();
    writeStandardPages();
    const xml = await buildFeedDocument('atom', { siteUrl: 'https://example.com' });
    expect(xml).not.toBeNull();
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom"');
    expect(xml).toContain('xml:lang="zh"');
    expect(xml).toContain('https://example.com/research');
  });

  it('json 格式输出 JSON Feed 1.1，含 date_published/date_modified', async () => {
    writeSiteYaml(['feed:', '  formats: [json]'].join('\n'));
    writeStandardPages();
    const raw = await buildFeedDocument('json', { siteUrl: 'https://example.com' });
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.version).toBe('https://jsonfeed.org/version/1.1');
    expect(parsed.title).toBe('测试站点');
    expect(parsed.feed_url).toBe('https://example.com/feed.json');
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].date_published).toBe('2026-08-20T00:00:00.000Z');
    expect(parsed.items[0].date_modified).toBe('2026-08-29T00:00:00.000Z');
    expect(parsed.items[0].content_html).toContain('https://example.com/assets/pic.jpg');
  });

  it('未提供 siteUrl 时保留站内相对链接', async () => {
    writeSiteYaml();
    writeStandardPages();
    const xml = await buildFeedDocument('rss');
    expect(xml).not.toBeNull();
    expect(xml).toContain('<link>/research</link>');
  });

  it('include_home: true 时首页进入 feed', async () => {
    writeSiteYaml(['feed:', '  include_home: true'].join('\n'));
    writeStandardPages();
    const xml = await buildFeedDocument('rss', { siteUrl: 'https://example.com' });
    expect(xml).not.toBeNull();
    expect(xml).toContain('首页');
  });

  it('site.description 未配置时 feed 描述回退站点标题', async () => {
    writeSiteYaml(['feed:', '  formats: [json]'].join('\n'), { description: false });
    writeStandardPages();
    const raw = await buildFeedDocument('json', { siteUrl: 'https://example.com' });
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.description).toBe('测试站点');
  });
});

describe('buildFeedDocument publications.yaml 注入', () => {
  const PUBS_YAML = [
    'enabled: true',
    'items:',
    '  - id: p1',
    '    title: 论文甲',
    '    authors: [张三]',
    '    year: 2025',
    '    venue: 某会议',
    '',
  ].join('\n');

  function writePubPages(): void {
    writePage('zh', 'research.md', ['title: 研究方向', 'date: "2026-08-20"'], '::publications');
  }

  it('publications.yaml 启用时正文 ::publications 指令渲染为论文列表', async () => {
    writeSiteYaml();
    writePubPages();
    writeFileSync(path.join(dataDir, 'publications.yaml'), PUBS_YAML);
    const xml = await buildFeedDocument('rss', { siteUrl: 'https://example.com' });
    expect(xml).not.toBeNull();
    expect(xml).toContain('论文甲');
    expect(xml).toContain('publications');
  });

  it('publications.yaml 显式 enabled: false 时不注入渲染上下文', async () => {
    writeSiteYaml();
    writePubPages();
    writeFileSync(path.join(dataDir, 'publications.yaml'), PUBS_YAML.replace('enabled: true', 'enabled: false'));
    const xml = await buildFeedDocument('rss', { siteUrl: 'https://example.com' });
    expect(xml).not.toBeNull();
    expect(xml).not.toContain('论文甲');
  });
});

describe('feedLangParams', () => {
  const page = (lang: string): PageEntry => ({
    lang, slug: '/x', title: 't', nav: true, body: '', filePath: '',
  });

  it('排除默认语言并对语言去重', () => {
    expect(feedLangParams([page('zh'), page('zh'), page('en')], 'zh-CN')).toEqual(['en']);
  });

  it('defaultLanguage 未配置时按 zh 兜底', () => {
    expect(feedLangParams([page('en')], undefined)).toEqual(['en']);
    expect(feedLangParams([page('zh')], undefined)).toEqual([]);
    expect(feedLangParams([], undefined)).toEqual([]);
  });
});

describe('feedPathFor', () => {
  it('默认语言无前缀，非默认语言带 /lang/ 前缀', () => {
    expect(feedPathFor('zh', 'zh', 'rss')).toBe('/feed.xml');
    expect(feedPathFor('en', 'zh', 'rss')).toBe('/en/feed.xml');
    expect(feedPathFor('en', 'zh', 'atom')).toBe('/en/feed.atom.xml');
    expect(feedPathFor('ja', 'zh', 'json')).toBe('/ja/feed.json');
  });
});
