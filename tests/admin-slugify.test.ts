import { describe, it, expect } from 'vitest';
import { slugify, isValidSlug } from '../admin/shared/slugify.ts';

describe('slugify', () => {
  it('拉丁标题转小写连字符', () => {
    expect(slugify('My Research')).toBe('my-research');
    expect(slugify('  Hello   World  ')).toBe('hello-world');
    expect(slugify('CV_2026 Final')).toBe('cv-2026-final');
  });

  it('CJK 标题保留原字符', () => {
    expect(slugify('研究方向')).toBe('研究方向');
    expect(slugify('项目 列表')).toBe('项目-列表');
  });

  it('剥离特殊字符并收敛连字符', () => {
    expect(slugify('a/b\\c:d')).toBe('abcd');
    expect(slugify('ok!!')).toBe('ok');
    expect(slugify('!!')).toBe('');
  });
});

describe('isValidSlug', () => {
  it('接受常规 slug 与主页特例 /', () => {
    expect(isValidSlug('research')).toBe(true);
    expect(isValidSlug('my-notes-2')).toBe(true);
    expect(isValidSlug('研究方向')).toBe(true);
    expect(isValidSlug('/')).toBe(true);
  });

  it('拒绝穿越与分隔符', () => {
    expect(isValidSlug('a/b')).toBe(false);
    expect(isValidSlug('..')).toBe(false);
    expect(isValidSlug('a b')).toBe(false);
    expect(isValidSlug('')).toBe(false);
    expect(isValidSlug('-lead')).toBe(false);
  });
});
