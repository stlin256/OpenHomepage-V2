import { describe, expect, it } from 'vitest';
import {
  languageDisplayName,
  localizedPathname,
  normalizeSiteLanguage,
  orderLangMenu,
} from '../src/lib/language.ts';

describe('normalizeSiteLanguage', () => {
  it('normalizes primary language tags（任意语言，不限固定列表）', () => {
    expect(normalizeSiteLanguage('zh-CN')).toBe('zh');
    expect(normalizeSiteLanguage('en_US')).toBe('en');
    expect(normalizeSiteLanguage('fr')).toBe('fr');
    expect(normalizeSiteLanguage('ja-JP')).toBe('ja');
    expect(normalizeSiteLanguage('de')).toBe('de');
    expect(normalizeSiteLanguage('pt-BR')).toBe('pt');
  });

  it('rejects malformed codes', () => {
    expect(normalizeSiteLanguage('')).toBeNull();
    expect(normalizeSiteLanguage(null)).toBeNull();
    expect(normalizeSiteLanguage('x')).toBeNull();
    expect(normalizeSiteLanguage('1234')).toBeNull();
    expect(normalizeSiteLanguage('../zh')).toBeNull();
  });

  it('对照站点语言列表校验（防止跳转到不存在的语言）', () => {
    const siteLangs = ['zh', 'en', 'ja', 'fr'];
    expect(normalizeSiteLanguage('de', siteLangs)).toBeNull();
    expect(normalizeSiteLanguage('fr-FR', siteLangs)).toBe('fr');
    expect(normalizeSiteLanguage('de', [...siteLangs, 'de'])).toBe('de');
  });
});

describe('languageDisplayName', () => {
  it('返回自称名（Intl.DisplayNames）', () => {
    expect(languageDisplayName('zh')).toBe('中文');
    expect(languageDisplayName('en')).toBe('English');
    expect(languageDisplayName('de')).toBe('Deutsch');
    expect(languageDisplayName('fr')).toBe('Français');
  });

  it('无法取名时回退原始语言码', () => {
    // 结构非法的语言码让 Intl.DisplayNames 抛 RangeError → 回退原始值
    expect(languageDisplayName('123')).toBe('123');
  });
});

describe('localizedPathname', () => {
  it('maps the current route to the selected language without changing search or hash', () => {
    expect(localizedPathname('en', '/', 'zh', 'zh')).toBe('/en/');
    expect(localizedPathname('en', '/features/', 'zh', 'zh')).toBe('/en/features/');
    expect(localizedPathname('zh', '/en/features', 'en', 'zh')).toBe('/features');
  });

  it('handles base path correctly', () => {
    expect(localizedPathname('en', '/OpenHomepage-V2/', 'zh', 'zh', '/OpenHomepage-V2/')).toBe('/OpenHomepage-V2/en/');
    expect(localizedPathname('en', '/OpenHomepage-V2/features/', 'zh', 'zh', '/OpenHomepage-V2/')).toBe('/OpenHomepage-V2/en/features/');
    expect(localizedPathname('zh', '/OpenHomepage-V2/en/features', 'en', 'zh', '/OpenHomepage-V2/')).toBe('/OpenHomepage-V2/features');
  });
});

describe('orderLangMenu', () => {
  const alternates = [
    { lang: 'zh', path: '/' },
    { lang: 'en', path: '/en/' },
    { lang: 'ja', path: '/ja/' },
    { lang: 'fr', path: '/fr/' },
  ];

  it('当前语言置顶，其余保持站点语言顺序', () => {
    expect(orderLangMenu(alternates, 'en').map((a) => a.lang)).toEqual(['en', 'zh', 'ja', 'fr']);
    expect(orderLangMenu(alternates, 'fr').map((a) => a.lang)).toEqual(['fr', 'zh', 'en', 'ja']);
    expect(orderLangMenu(alternates, 'zh').map((a) => a.lang)).toEqual(['zh', 'en', 'ja', 'fr']);
  });

  it('当前语言不在列表中时保持原顺序；不改入参', () => {
    const input = alternates.map((a) => ({ ...a }));
    expect(orderLangMenu(input, 'de').map((a) => a.lang)).toEqual(['zh', 'en', 'ja', 'fr']);
    expect(input.map((a) => a.lang)).toEqual(['zh', 'en', 'ja', 'fr']);
  });
});