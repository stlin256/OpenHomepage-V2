import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPages, detectLanguages } from '../src/lib/config.ts';
import {
  normalizeLang,
  pageUrlPath,
  buildRoutes,
  navPagesForLang,
  alternateLinks,
} from '../src/lib/routes.ts';

const EXAMPLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/data');

describe('normalizeLang', () => {
  it('取主语言子标签', () => {
    expect(normalizeLang('zh-CN')).toBe('zh');
    expect(normalizeLang('en_US')).toBe('en');
    expect(normalizeLang('en')).toBe('en');
  });

  it('空值返回 undefined', () => {
    expect(normalizeLang(undefined)).toBeUndefined();
    expect(normalizeLang('')).toBeUndefined();
  });
});

describe('pageUrlPath', () => {
  it('默认语言无前缀', () => {
    expect(pageUrlPath('/', 'zh', 'zh')).toBe('/');
    expect(pageUrlPath('research', 'zh', 'zh')).toBe('/research');
  });

  it('其他语言带 /lang/ 前缀', () => {
    expect(pageUrlPath('/', 'en', 'zh')).toBe('/en/');
    expect(pageUrlPath('research', 'en', 'zh')).toBe('/en/research');
  });
});

describe('buildRoutes', () => {
  const pages = loadPages(EXAMPLE); // zh: /, research; en: /
  const langs = detectLanguages(pages); // [en, zh]

  it('i18n 站点：默认语言无前缀，其他语言带前缀，覆盖 lang × slug 全组合', () => {
    const routes = buildRoutes(pages, langs, 'zh');
    const paths = routes.map((r) => r.path).sort();
    expect(paths).toEqual(['/', '/en/', '/en/research', '/research']);
  });

  it('Astro param：根路径为 undefined，其余为无斜杠路径', () => {
    const routes = buildRoutes(pages, langs, 'zh');
    const paramOf = (p: string) => routes.find((r) => r.path === p)!.param;
    expect(paramOf('/')).toBeUndefined();
    expect(paramOf('/research')).toBe('research');
    expect(paramOf('/en/')).toBe('en');
    expect(paramOf('/en/research')).toBe('en/research');
  });

  it('缺失译文的路由按回退链解析并标记 fallback', () => {
    const routes = buildRoutes(pages, langs, 'zh');
    const enResearch = routes.find((r) => r.path === '/en/research')!;
    expect(enResearch.fallback).toBe(true);
    expect(enResearch.page.lang).toBe('zh'); // 回退到默认语言版本
    const enIndex = routes.find((r) => r.path === '/en/')!;
    expect(enIndex.fallback).toBe(false);
    expect(enIndex.page.lang).toBe('en');
  });

  it('单语言站点：全部无前缀且无 fallback', () => {
    const zhOnly = pages.filter((p) => p.lang === 'zh');
    const routes = buildRoutes(zhOnly, ['zh'], 'zh');
    expect(routes.map((r) => r.path).sort()).toEqual(['/', '/research']);
    expect(routes.every((r) => !r.fallback)).toBe(true);
  });

  it('site.language 不在页面语言中时回退到首个可用语言作默认', () => {
    const routes = buildRoutes(pages, langs, 'fr');
    // 默认语言回退为 en（字典序首个），en 无前缀
    expect(routes.map((r) => r.path).sort()).toEqual(['/', '/research', '/zh/', '/zh/research']);
  });
});

describe('navPagesForLang', () => {
  const pages = loadPages(EXAMPLE);

  it('按 order 排序并生成对应语言 URL', () => {
    const nav = navPagesForLang(pages, 'zh', 'zh');
    expect(nav.map((n) => n.path)).toEqual(['/', '/research']);
    expect(nav.map((n) => n.title)).toEqual(['主页', '研究方向']);
  });

  it('缺失译文时按回退链取标题，URL 仍用当前语言前缀', () => {
    const nav = navPagesForLang(pages, 'en', 'zh');
    expect(nav.map((n) => n.path)).toEqual(['/en/', '/en/research']);
    expect(nav[1].title).toBe('研究方向'); // research 无 en 版，回退 zh 标题
  });

  it('nav: false 的页面不进导航', () => {
    const custom = [
      { lang: 'zh', slug: '/', title: '主页', nav: true, order: 0, body: '', filePath: '' },
      { lang: 'zh', slug: 'hidden', title: '隐藏', nav: false, order: 1, body: '', filePath: '' },
      { lang: 'zh', slug: 'about', title: '关于', nav: true, order: 2, body: '', filePath: '' },
    ];
    const nav = navPagesForLang(custom, 'zh', 'zh');
    expect(nav.map((n) => n.slug)).toEqual(['/', 'about']);
  });
});

describe('alternateLinks', () => {
  const pages = loadPages(EXAMPLE); // zh: /, research; en: /（research 无 en 版）

  it('只输出当前 slug 真实存在的语言版本（不含回退）', () => {
    // 主页 zh/en 都有 → 两个链接
    expect(alternateLinks(pages, '/', ['en', 'zh'], 'zh')).toEqual([
      { lang: 'en', path: '/en/' },
      { lang: 'zh', path: '/' },
    ]);
    // research 只有 zh 真实版本 → 不输出 en 回退链接
    expect(alternateLinks(pages, 'research', ['en', 'zh'], 'zh')).toEqual([
      { lang: 'zh', path: '/research' },
    ]);
  });

  it('单语言站点不输出备选链接', () => {
    const zhOnly = pages.filter((p) => p.lang === 'zh');
    expect(alternateLinks(zhOnly, 'research', ['zh'], 'zh')).toEqual([]);
  });
});
