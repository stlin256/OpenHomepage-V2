import { describe, it, expect } from 'vitest';
import { createT, detectLang, dict, type Lang } from '../admin/shared/i18n.ts';

describe('i18n 字典', () => {
  it('zh/en 键集合完全一致（所有文案双语齐全）', () => {
    const zhKeys = Object.keys(dict.zh).sort();
    const enKeys = Object.keys(dict.en).sort();
    expect(zhKeys).toEqual(enKeys);
    expect(zhKeys.length).toBeGreaterThan(40);
  });

  it('所有文案非空', () => {
    for (const lang of ['zh', 'en'] as Lang[]) {
      for (const [k, v] of Object.entries(dict[lang])) {
        expect(v.trim(), `${lang}.${k}`).not.toBe('');
      }
    }
  });
});

describe('createT', () => {
  it('按语言查取；缺失键回退另一语言，再回退键名', () => {
    const t = createT('zh');
    expect(t('save')).toBe(dict.zh.save);
    expect(createT('en')('save')).toBe(dict.en.save);
    expect(t('__missing_key__')).toBe('__missing_key__');
  });
});

describe('detectLang', () => {
  it('localStorage 记忆优先，其次浏览器语言，默认 zh', () => {
    expect(detectLang('en-US', 'zh')).toBe('zh');
    expect(detectLang('zh-CN', 'en')).toBe('en');
    expect(detectLang('en-US', null)).toBe('en');
    expect(detectLang('zh-CN', null)).toBe('zh');
    expect(detectLang('fr-FR', null)).toBe('zh');
    expect(detectLang('en-US', 'garbage')).toBe('en');
  });
});
