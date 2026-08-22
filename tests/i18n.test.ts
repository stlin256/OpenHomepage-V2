import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPages, resolveText, resolvePageForLang } from '../src/lib/config.ts';

const EXAMPLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data.example');

describe('resolveText', () => {
  it('纯字符串原样返回', () => {
    expect(resolveText('通用文案', 'zh')).toBe('通用文案');
    expect(resolveText('通用文案', 'en')).toBe('通用文案');
  });

  it('双语映射按语言取值', () => {
    const field = { zh: '博士研究生', en: 'PhD candidate' };
    expect(resolveText(field, 'zh')).toBe('博士研究生');
    expect(resolveText(field, 'en')).toBe('PhD candidate');
  });

  it('缺当前语言 key 时回退另一语言', () => {
    expect(resolveText({ zh: '只有中文' }, 'en')).toBe('只有中文');
    expect(resolveText({ en: 'English only' }, 'zh')).toBe('English only');
  });

  it('映射里两个 key 都缺时回退任意可用值', () => {
    expect(resolveText({ fr: 'français' }, 'zh')).toBe('français');
  });
});

describe('resolvePageForLang', () => {
  const pages = loadPages(EXAMPLE); // zh: /, research; en: /（无 en/research）

  it('当前语言存在对应页面 → 命中且 fallback=false', () => {
    const { page, fallback } = resolvePageForLang(pages, 'research', 'zh', 'zh')!;
    expect(page.lang).toBe('zh');
    expect(page.title).toBe('研究方向');
    expect(fallback).toBe(false);
  });

  it('当前语言缺失 → 回退 en，fallback=true', () => {
    // 构造只有 en 版本页面的场景：data.example 无 zh-only 之外的组合，
    // 用临时页面对象验证链的优先级
    const custom = [
      { lang: 'en', slug: 'about', title: 'About', nav: true, order: 1, body: '', filePath: '' },
    ];
    const r = resolvePageForLang(custom, 'about', 'zh', 'zh')!;
    expect(r.page.lang).toBe('en');
    expect(r.fallback).toBe(true);
  });

  it('无 en 版本时回退默认语言', () => {
    const custom = [
      { lang: 'zh', slug: 'x', title: 'X', nav: true, order: 1, body: '', filePath: '' },
    ];
    const r = resolvePageForLang(custom, 'x', 'en', 'zh')!;
    expect(r.page.lang).toBe('zh');
    expect(r.fallback).toBe(true);
  });

  it('当前语言与默认语言都无时回退任一可用版本', () => {
    const custom = [
      { lang: 'ja', slug: 'y', title: 'Y', nav: true, order: 1, body: '', filePath: '' },
    ];
    const r = resolvePageForLang(custom, 'y', 'zh', 'zh')!;
    expect(r.page.lang).toBe('ja');
    expect(r.fallback).toBe(true);
  });

  it('默认语言命中时 fallback=false', () => {
    const r = resolvePageForLang(pages, '/', 'zh', 'zh')!;
    expect(r.page.lang).toBe('zh');
    expect(r.fallback).toBe(false);
  });

  it('所有语言都没有该 slug → 返回 null', () => {
    expect(resolvePageForLang(pages, 'nonexistent', 'zh', 'zh')).toBeNull();
  });
});
