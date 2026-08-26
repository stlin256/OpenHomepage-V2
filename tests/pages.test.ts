import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPages, detectLanguages, isI18nEnabled } from '../src/lib/config.ts';

const EXAMPLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/data');

function withTempData(files: Record<string, string>, fn: (dir: string) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'oh-pages-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const p = path.join(dir, rel);
      mkdirSync(path.dirname(p), { recursive: true });
      writeFileSync(p, content, 'utf8');
    }
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('loadPages', () => {
  it('扫描 data.example/pages 得到 3 个页面', () => {
    const pages = loadPages(EXAMPLE);
    expect(pages).toHaveLength(3);
    const langs = pages.map((p) => p.lang).sort();
    expect(langs).toEqual(['en', 'zh', 'zh']);
  });

  it('index.md 的 slug 为 /，其余用文件名', () => {
    const pages = loadPages(EXAMPLE);
    const zhIndex = pages.find((p) => p.lang === 'zh' && p.slug === '/')!;
    expect(zhIndex.title).toBe('主页');
    expect(zhIndex.body).toContain('欢迎来到我的主页');
    const research = pages.find((p) => p.lang === 'zh' && p.slug === 'research')!;
    expect(research.title).toBe('研究方向');
  });

  it('frontmatter 显式 slug 优先于文件名；filePath 指向源文件', () => {
    withTempData({
      'pages/zh/about.md': '---\ntitle: 关于\nslug: about-me\n---\n正文\n',
    }, (dir) => {
      const pages = loadPages(dir);
      expect(pages[0].slug).toBe('about-me');
      expect(pages[0].filePath).toBe(path.join(dir, 'pages/zh/about.md'));
    });
  });

  it('nav/order 排序：order 小的在前，缺省 order 排最后', () => {
    withTempData({
      'pages/zh/index.md': '---\ntitle: 主页\norder: 0\n---\n',
      'pages/zh/b.md': '---\ntitle: B\norder: 5\n---\n',
      'pages/zh/a.md': '---\ntitle: A\norder: 2\n---\n',
      'pages/zh/c.md': '---\ntitle: C\n---\n',
    }, (dir) => {
      const pages = loadPages(dir);
      expect(pages.map((p) => p.title)).toEqual(['主页', 'A', 'B', 'C']);
    });
  });

  it('nav 缺省为 true；正文与 frontmatter 正确分离', () => {
    withTempData({
      'pages/zh/x.md': '---\ntitle: X\nnav: false\n---\n第一行\n\n第二行\n',
    }, (dir) => {
      const [p] = loadPages(dir);
      expect(p.nav).toBe(false);
      expect(p.body).toBe('第一行\n\n第二行\n');
    });
    const pages = loadPages(EXAMPLE);
    expect(pages.every((p) => p.nav === true)).toBe(true);
  });

  it("支持解析 frontmatter 的 notice 字段（字符串或结构化对象），缺省为 undefined", () => {
    withTempData({
      "pages/zh/with-notice.md": "---\ntitle: 通知页\nnotice: 本页面为示例页面\n---\n正文\n",
      "pages/zh/with-yellow.md": "---\ntitle: 黄色通知\nnotice:\n  text: 示例黄色声明\n  color: yellow\n---\n正文\n",
      "pages/zh/no-notice.md": "---\ntitle: 无通知页\n---\n正文\n",
    }, (dir) => {
      const pages = loadPages(dir);
      const withN = pages.find((p) => p.slug === "with-notice")!;
      expect(withN.notice).toEqual({ text: "本页面为示例页面", color: "accent", delay: 500 });
      const withY = pages.find((p) => p.slug === "with-yellow")!;
      expect(withY.notice).toEqual({ text: "示例黄色声明", color: "yellow", delay: 500, customColor: undefined });
      const noN = pages.find((p) => p.slug === "no-notice")!;
      expect(noN.notice).toBeUndefined();
    });
  });

  it('缺 title 时报中文错误并指出文件', () => {
    withTempData({ 'pages/zh/bad.md': '---\norder: 1\n---\n正文\n' }, (dir) => {
      expect(() => loadPages(dir)).toThrowError(/title.*bad\.md|bad\.md.*title/);
    });
  });

  it('pages 目录不存在时返回空数组', () => {
    withTempData({}, (dir) => {
      expect(loadPages(dir)).toEqual([]);
    });
  });
});

describe('detectLanguages / isI18nEnabled', () => {
  it('data.example 检测到 zh 和 en', () => {
    const pages = loadPages(EXAMPLE);
    expect(detectLanguages(pages).sort()).toEqual(['en', 'zh']);
    expect(isI18nEnabled(detectLanguages(pages))).toBe(true);
  });

  it('单语言页面返回单元素列表且判定为未启用 i18n', () => {
    withTempData({
      'pages/zh/index.md': '---\ntitle: 主页\n---\n',
      'pages/zh/a.md': '---\ntitle: A\n---\n',
    }, (dir) => {
      const pages = loadPages(dir);
      expect(detectLanguages(pages)).toEqual(['zh']);
      expect(isI18nEnabled(detectLanguages(pages))).toBe(false);
    });
  });

  it('空页面列表 → 无语言且未启用', () => {
    expect(detectLanguages([])).toEqual([]);
    expect(isI18nEnabled([])).toBe(false);
  });
});
