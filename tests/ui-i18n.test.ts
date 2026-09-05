/**
 * UI 文案 i18n 字典（src/lib/ui-i18n.ts）结构与行为测试：
 * 不逐条断言文案字面量，聚焦——
 * 1) 全部 17 种语言的键结构与 en 基准完全一致（section 与字段）；
 * 2) 函数字段（directive.* / footnotes.backToRef）的插值行为；
 * 3) normalizeUiLang 的归一化与回退、getUiLabels 的查找/回退逻辑。
 */
import { describe, it, expect } from 'vitest';
import {
  UI_LANGS,
  UI_LABELS,
  normalizeUiLang,
  getUiLabels,
  type UiLabels,
} from '../src/lib/ui-i18n.ts';

/** 收集嵌套文案对象的字段路径与值类型（function / string），用于结构对比 */
function shapeOf(labels: UiLabels): Map<string, string> {
  const shape = new Map<string, string>();
  for (const [section, group] of Object.entries(labels)) {
    for (const [key, value] of Object.entries(group as Record<string, unknown>)) {
      shape.set(`${section}.${key}`, typeof value);
    }
  }
  return shape;
}

describe('normalizeUiLang', () => {
  it('已知语言码原样返回', () => {
    for (const lang of UI_LANGS) {
      expect(normalizeUiLang(lang)).toBe(lang);
    }
  });

  it('大小写与地区子标签归一化为主语言子标签', () => {
    expect(normalizeUiLang('ZH')).toBe('zh');
    expect(normalizeUiLang('zh-CN')).toBe('zh');
    expect(normalizeUiLang('zh_TW')).toBe('zh');
    expect(normalizeUiLang('EN-us')).toBe('en');
    expect(normalizeUiLang('ja_JP')).toBe('ja');
    expect(normalizeUiLang('fr-FR')).toBe('fr');
  });

  it('非法、空、null、undefined 一律回退 en', () => {
    expect(normalizeUiLang('xx')).toBe('en');
    expect(normalizeUiLang('')).toBe('en');
    expect(normalizeUiLang(null)).toBe('en');
    expect(normalizeUiLang(undefined)).toBe('en');
  });
});

describe('UI_LABELS 结构一致性', () => {
  it('语言表键集合与 UI_LANGS 一一对应', () => {
    expect(Object.keys(UI_LABELS).sort()).toEqual([...UI_LANGS].sort());
  });

  it('每种语言的字段路径与类型与 en 基准完全一致', () => {
    const base = shapeOf(UI_LABELS.en);
    for (const lang of UI_LANGS) {
      expect(shapeOf(UI_LABELS[lang]), `语言 ${lang} 的结构应与 en 一致`).toEqual(base);
    }
  });

  it('所有字符串字段非空（无遗漏翻译占位）', () => {
    for (const lang of UI_LANGS) {
      for (const [path, type] of shapeOf(UI_LABELS[lang])) {
        if (type !== 'string') continue;
        const [section, key] = path.split('.') as [keyof UiLabels, string];
        const value = (UI_LABELS[lang][section] as unknown as Record<string, unknown>)[key];
        expect(value, `${lang}.${path} 不应为空字符串`).not.toBe('');
      }
    }
  });

  it('函数字段恰好为 directive.missingParams / directive.unknown / footnotes.backToRef', () => {
    const fnPaths = [...shapeOf(UI_LABELS.en).entries()]
      .filter(([, type]) => type === 'function')
      .map(([path]) => path)
      .sort();
    expect(fnPaths).toEqual([
      'directive.missingParams',
      'directive.unknown',
      'footnotes.backToRef',
    ]);
  });
});

describe('插值函数', () => {
  it('每种语言的 directive 函数都插值指令名并返回非空文案', () => {
    for (const lang of UI_LANGS) {
      const { missingParams, unknown } = UI_LABELS[lang].directive;
      expect(missingParams('gallery'), `${lang}.directive.missingParams`).toContain('gallery');
      expect(unknown('gallery'), `${lang}.directive.unknown`).toContain('gallery');
      // 指令名之外应有实际文案，不是裸参数回显
      expect(missingParams('gallery').length).toBeGreaterThan('gallery'.length);
      expect(unknown('gallery').length).toBeGreaterThan('gallery'.length);
    }
  });

  it('每种语言的 footnotes.backToRef 都插值引用序号', () => {
    for (const lang of UI_LANGS) {
      const text = UI_LABELS[lang].footnotes.backToRef(7);
      expect(text, `${lang}.footnotes.backToRef`).toContain('7');
      expect(text.length).toBeGreaterThan(1);
    }
  });

  it('同一语言多次调用结果稳定（无闭包状态）', () => {
    for (const lang of UI_LANGS) {
      expect(UI_LABELS[lang].footnotes.backToRef(3)).toBe(UI_LABELS[lang].footnotes.backToRef(3));
      expect(UI_LABELS[lang].directive.unknown('x')).toBe(UI_LABELS[lang].directive.unknown('x'));
    }
  });
});

describe('getUiLabels', () => {
  it('按语言码返回对应文案表（同一引用）', () => {
    for (const lang of UI_LANGS) {
      expect(getUiLabels(lang)).toBe(UI_LABELS[lang]);
    }
  });

  it('地区码归一化后命中对应语言表', () => {
    expect(getUiLabels('zh-Hans-CN')).toBe(UI_LABELS.zh);
    expect(getUiLabels('JA_jp')).toBe(UI_LABELS.ja);
    expect(getUiLabels('fr-CA')).toBe(UI_LABELS.fr);
  });

  it('未知或缺失语言回退到 en', () => {
    expect(getUiLabels('klingon')).toBe(UI_LABELS.en);
    expect(getUiLabels('')).toBe(UI_LABELS.en);
    expect(getUiLabels(null)).toBe(UI_LABELS.en);
    expect(getUiLabels(undefined)).toBe(UI_LABELS.en);
  });
});
