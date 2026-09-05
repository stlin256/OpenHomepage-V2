/**
 * 站点内容语言工具（admin/shared/languages.ts）测试：
 * COMMON_LANGUAGES 列表完整性；languageName 三条取值路径（收录自称名 /
 * Intl.DisplayNames 取名并首字母大写 / Intl 不支持时回退原始码）；
 * languageOptions 排序（已有语言在前、常用未建目录者随后）、exclude 过滤与
 * existing 标记、未知已有语言的命名回退。
 * 纯逻辑模块，无 DOM / 网络 / 文件系统依赖。
 */
import { describe, it, expect } from 'vitest';
import {
  COMMON_LANGUAGES,
  languageName,
  languageOptions,
} from '../admin/shared/languages.ts';

describe('COMMON_LANGUAGES', () => {
  it('包含项目四种内置语言（zh/en/ja/fr）且语言码不重复', () => {
    const codes = COMMON_LANGUAGES.map((l) => l.code);
    for (const c of ['zh', 'en', 'ja', 'fr']) {
      expect(codes).toContain(c);
    }
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('每项都带非空自称名', () => {
    for (const l of COMMON_LANGUAGES) {
      expect(l.code.length).toBeGreaterThan(0);
      expect(l.name.length).toBeGreaterThan(0);
    }
  });
});

describe('languageName', () => {
  it('收录语言返回自称名', () => {
    expect(languageName('zh')).toBe('中文');
    expect(languageName('en')).toBe('English');
    expect(languageName('ja')).toBe('日本語');
    expect(languageName('fr')).toBe('Français');
  });

  it('未收录语言经 Intl.DisplayNames 取名（首字母大写）', () => {
    // el（希腊语）不在常用列表，Intl 会给出本地化名称
    expect(COMMON_LANGUAGES.some((l) => l.code === 'el')).toBe(false);
    const name = languageName('el');
    expect(name).not.toBe('el');
    expect(name.length).toBeGreaterThan(0);
    // 首字符为大写（希腊语英文名 Greek → G 大写）
    expect(name).toBe(new Intl.DisplayNames(['el'], { type: 'language' }).of('el'));
  });

  it('Intl 不支持的语言码回退原始 code', () => {
    // 非法 BCP 47 标记：Intl.DisplayNames 构造抛 RangeError → 走 catch 分支
    expect(languageName('invalid code!')).toBe('invalid code!');
  });

  it('空字符串语言码回退原始 code（空串）', () => {
    expect(languageName('')).toBe('');
  });
});

describe('languageOptions', () => {
  it('已有语言按传入顺序在前并标记 existing，常用语言中未建目录者随后', () => {
    const opts = languageOptions(['zh', 'en']);
    // 已有语言在前
    expect(opts[0]).toEqual({ code: 'zh', label: '中文 (zh)', existing: true });
    expect(opts[1]).toEqual({ code: 'en', label: 'English (en)', existing: true });
    // 随后是常用语言中不在已有列表里的，标记 existing: false
    const rest = opts.slice(2);
    expect(rest.length).toBe(COMMON_LANGUAGES.length - 2);
    expect(rest.every((o) => o.existing === false)).toBe(true);
    expect(rest.some((o) => o.code === 'zh')).toBe(false);
    expect(rest.some((o) => o.code === 'en')).toBe(false);
    expect(rest[0].code).toBe('ja'); // 常用列表顺序保持
  });

  it('已有语言顺序完全按传入，不做排序', () => {
    const opts = languageOptions(['en', 'zh']);
    expect(opts.map((o) => o.code).slice(0, 2)).toEqual(['en', 'zh']);
  });

  it('exclude 同时过滤已有语言与常用语言', () => {
    const opts = languageOptions(['zh', 'en', 'ja'], ['en', 'de']);
    const codes = opts.map((o) => o.code);
    expect(codes).toContain('zh');
    expect(codes).toContain('ja');
    expect(codes).not.toContain('en'); // 已有但被排除
    expect(codes).not.toContain('de'); // 常用但被排除
  });

  it('exclude 默认空数组（不传第二参不过滤）', () => {
    const opts = languageOptions(['zh']);
    expect(opts.some((o) => o.code === 'zh' && o.existing)).toBe(true);
    // 其余常用语言全部出现
    expect(opts.filter((o) => !o.existing).length).toBe(COMMON_LANGUAGES.length - 1);
  });

  it('已有语言为未收录语言码时经 languageName 命名', () => {
    const opts = languageOptions(['el']);
    expect(opts[0]).toEqual({
      code: 'el',
      label: `${languageName('el')} (el)`,
      existing: true,
    });
  });

  it('空已有列表：全部为常用语言（existing: false）', () => {
    const opts = languageOptions([]);
    expect(opts.length).toBe(COMMON_LANGUAGES.length);
    expect(opts.every((o) => o.existing === false)).toBe(true);
    expect(opts.map((o) => o.code)).toEqual(COMMON_LANGUAGES.map((l) => l.code));
  });
});
