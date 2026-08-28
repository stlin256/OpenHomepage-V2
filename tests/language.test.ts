import { describe, expect, it } from 'vitest';
import { localizedPathname, normalizeSiteLanguage } from '../src/lib/language.ts';

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