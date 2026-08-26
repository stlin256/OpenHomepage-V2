import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  listPages,
  readPage,
  writePage,
  createPage,
  renamePage,
  deletePage,
  serializePage,
} from '../admin/server/pages.ts';
import { listSnapshots } from '../admin/server/snapshots.ts';

function withTempData(fn: (dir: string) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'oh-admin-pages-'));
  try {
    mkdirSync(path.join(dir, 'pages/zh'), { recursive: true });
    mkdirSync(path.join(dir, 'pages/en'), { recursive: true });
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const INDEX = '---\ntitle: 主页\nnav: true\norder: 0\n---\n你好，世界\n';
const RESEARCH = '---\ntitle: 研究\norder: 2\ndescription: 研究方向\n---\n正文\n';

describe('listPages', () => {
  it('按语言目录分组列出页面元数据', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, 'pages/zh/index.md'), INDEX);
      writeFileSync(path.join(dir, 'pages/zh/research.md'), RESEARCH);
      const pages = listPages(dir);
      expect(pages).toHaveLength(2);
      const zh = pages.filter((p) => p.lang === 'zh');
      expect(zh.map((p) => p.file).sort()).toEqual(['index.md', 'research.md']);
      const idx = zh.find((p) => p.file === 'index.md')!;
      expect(idx.title).toBe('主页');
      expect(idx.slug).toBe('/');
      expect(idx.nav).toBe(true);
      expect(idx.order).toBe(0);
      const res = zh.find((p) => p.file === 'research.md')!;
      expect(res.slug).toBe('research');
      expect(res.description).toBe('研究方向');
    });
  });

  it('读取 frontmatter 中的 notice 字段', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, 'pages/zh/index.md'), '---\ntitle: 主页\nnotice: 示例声明\n---\n');
      const pages = listPages(dir);
      expect(pages[0].notice).toBe('示例声明');
    });
  });

  it('frontmatter 缺 title 的页面不导致整个列表崩溃', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, 'pages/zh/index.md'), INDEX);
      writeFileSync(path.join(dir, 'pages/zh/bad.md'), '---\norder: 3\n---\n无标题\n');
      const pages = listPages(dir);
      const bad = pages.find((p) => p.file === 'bad.md')!;
      expect(bad.title).toBe('');
    });
  });
});

describe('readPage / writePage', () => {
  it('读出 frontmatter 与正文', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, 'pages/zh/index.md'), INDEX);
      const page = readPage(dir, 'zh', 'index.md');
      expect(page.frontmatter.title).toBe('主页');
      expect(page.frontmatter.order).toBe(0);
      expect(page.body).toBe('你好，世界\n');
    });
  });

  it('写入时校验 title 必需，缺 title 拒绝写盘', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, 'pages/zh/index.md'), INDEX);
      expect(() =>
        writePage(dir, 'zh', 'index.md', { nav: true }, '正文')
      ).toThrowError(/title/);
      expect(readFileSync(path.join(dir, 'pages/zh/index.md'), 'utf8')).toBe(INDEX);
    });
  });

  it('写盘前自动快照旧版本，frontmatter+正文序列化可回读', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, 'pages/zh/index.md'), INDEX);
      writePage(dir, 'zh', 'index.md', { title: '主页 v2', nav: true, order: 0 }, '新正文\n');
      const snaps = listSnapshots(dir, 'pages/zh/index.md');
      expect(snaps).toHaveLength(1);
      const page = readPage(dir, 'zh', 'index.md');
      expect(page.frontmatter.title).toBe('主页 v2');
      expect(page.body).toBe('新正文\n');
      // slug 字段往返保留
      writePage(dir, 'zh', 'index.md', { ...page.frontmatter, slug: '/' }, page.body);
      expect(readPage(dir, 'zh', 'index.md').frontmatter.slug).toBe('/');
    });
  });

  it('不存在的文件读出报错', () => {
    withTempData((dir) => {
      expect(() => readPage(dir, 'zh', 'nope.md')).toThrowError(/不存在/);
    });
  });
});

describe('createPage', () => {
  it('由标题自动生成 slug 与 frontmatter 模板', () => {
    withTempData((dir) => {
      const r = createPage(dir, 'en', 'My Research');
      expect(r.file).toBe('my-research.md');
      const page = readPage(dir, 'en', 'my-research.md');
      expect(page.frontmatter.title).toBe('My Research');
      expect(page.frontmatter.nav).toBe(true);
      expect(typeof page.frontmatter.order).toBe('number');
      expect(page.body).toBe('\n');
    });
  });

  it('支持显式 slug 与内容模板（创建另一语言版）', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, 'pages/zh/research.md'), RESEARCH);
      const src = readPage(dir, 'zh', 'research.md');
      const r = createPage(dir, 'en', 'Research', 'research', src.body);
      expect(r.file).toBe('research.md');
      expect(readPage(dir, 'en', 'research.md').body).toBe('正文\n');
    });
  });

  it('目标文件已存在 / slug 非法时拒绝', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, 'pages/zh/index.md'), INDEX);
      expect(() => createPage(dir, 'zh', '主页', 'index')).toThrowError(/已存在/);
      expect(() => createPage(dir, 'zh', 'X', 'a/b')).toThrowError(/slug/i);
      expect(() => createPage(dir, 'zh', 'X', '..')).toThrowError(/slug/i);
    });
  });

  it('空标题直接报错', () => {
    withTempData((dir) => {
      expect(() => createPage(dir, 'zh', '  ')).toThrowError(/title|标题/);
    });
  });
});

describe('renamePage / deletePage', () => {
  it('重命名移动文件且不落快照（内容未变）', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, 'pages/zh/research.md'), RESEARCH);
      renamePage(dir, 'zh', 'research.md', 'projects.md');
      expect(existsSync(path.join(dir, 'pages/zh/research.md'))).toBe(false);
      expect(readPage(dir, 'zh', 'projects.md').frontmatter.title).toBe('研究');
    });
  });

  it('重命名拒绝非法新名与覆盖已存在文件', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, 'pages/zh/a.md'), INDEX);
      writeFileSync(path.join(dir, 'pages/zh/b.md'), INDEX);
      expect(() => renamePage(dir, 'zh', 'a.md', 'b.md')).toThrowError(/已存在/);
      expect(() => renamePage(dir, 'zh', 'a.md', 'x/y.md')).toThrowError(/非法/);
      expect(() => renamePage(dir, 'zh', 'a.md', 'noext')).toThrowError(/\.md/);
    });
  });

  it('删除前先把内容入快照以便找回', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, 'pages/zh/research.md'), RESEARCH);
      deletePage(dir, 'zh', 'research.md');
      expect(existsSync(path.join(dir, 'pages/zh/research.md'))).toBe(false);
      expect(listSnapshots(dir, 'pages/zh/research.md').length).toBeGreaterThan(0);
    });
  });
});

describe('serializePage', () => {
  it('frontmatter 序列化为 --- 包裹的 YAML', () => {
    const text = serializePage({ title: 'T', nav: false, order: 3 }, '正文\n');
    expect(text.startsWith('---\n')).toBe(true);
    expect(text).toContain('title: T');
    expect(text).toContain('nav: false');
    expect(text.endsWith('正文\n')).toBe(true);
  });
});
