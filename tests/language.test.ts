import { describe, expect, it } from 'vitest';
import { localizedPathname, normalizeSiteLanguage, orderLangMenu } from '../src/lib/language.ts';

describe('normalizeSiteLanguage', () => {
  it('normalizes supported primary language tags', () => {
    expect(normalizeSiteLanguage('zh-CN')).toBe('zh');
    expect(normalizeSiteLanguage('en_US')).toBe('en');
    expect(normalizeSiteLanguage('fr')).toBe('fr');
    expect(normalizeSiteLanguage('ja-JP')).toBe('ja');
    expect(normalizeSiteLanguage('de')).toBeNull();
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