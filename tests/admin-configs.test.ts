import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  readSiteConfig,
  writeSiteConfig,
  readRssConfig,
  writeRssConfig,
} from '../admin/server/configs.ts';
import { listSnapshots } from '../admin/server/snapshots.ts';

const SITE = [
  'site:',
  '  title: 张三的主页',
  '  language: zh-CN',
  'profile:',
  '  name: 张三',
  'github:',
  '  username: zhangsan',
  'theme:',
  '  accent: "#3a7bd5"',
  '',
].join('\n');

const RSS = [
  'display: grouped',
  'sources:',
  '  - name: 某博客',
  '    url: https://example.com/feed.xml',
  '    mode: latest',
  '',
].join('\n');

function withTempData(fn: (dir: string) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'oh-admin-cfg-'));
  try {
    writeFileSync(path.join(dir, 'site.yaml'), SITE);
    writeFileSync(path.join(dir, 'rss.yaml'), RSS);
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('readSiteConfig / readRssConfig', () => {
  it('读取为结构化对象', () => {
    withTempData((dir) => {
      const site = readSiteConfig(dir);
      expect(site.site.title).toBe('张三的主页');
      expect(site.theme!.accent).toBe('#3a7bd5');
      const rss = readRssConfig(dir);
      expect(rss.sources[0].mode).toBe('latest');
    });
  });

  it('YAML 语法错误抛解析错误', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, 'site.yaml'), 'site: [broken');
      expect(() => readSiteConfig(dir)).toThrowError(/YAML|解析/i);
    });
  });
});

describe('writeSiteConfig', () => {
  it('合法写回并产生快照；theme.accent 可更新（取色器回写路径）', () => {
    withTempData((dir) => {
      const site = readSiteConfig(dir);
      site.theme = { ...site.theme, accent: '#ff0066' };
      writeSiteConfig(dir, site);
      expect(readSiteConfig(dir).theme!.accent).toBe('#ff0066');
      expect(listSnapshots(dir, 'site.yaml')).toHaveLength(1);
    });
  });

  it('schema 非法（缺 github.username）拒绝写盘且原文件不变', () => {
    withTempData((dir) => {
      const site = readSiteConfig(dir) as unknown as Record<string, unknown>;
      site.github = {};
      expect(() => writeSiteConfig(dir, site as never)).toThrowError(/github\.username/);
      expect(readFileSync(path.join(dir, 'site.yaml'), 'utf8')).toBe(SITE);
      expect(listSnapshots(dir, 'site.yaml')).toHaveLength(0);
    });
  });

  it('theme.accent 非法 hex 拒绝写盘', () => {
    withTempData((dir) => {
      const site = readSiteConfig(dir);
      site.theme = { accent: 'red' };
      expect(() => writeSiteConfig(dir, site)).toThrowError(/accent/);
    });
  });

  it('theme.background 非法 hex 拒绝写盘', () => {
    withTempData((dir) => {
      const site = readSiteConfig(dir);
      site.theme = { ...site.theme, background: 'beige' };
      expect(() => writeSiteConfig(dir, site)).toThrowError(/theme\.background/);
    });
  });
});

describe('writeRssConfig', () => {
  it('合法写回；curated 源带 articles 子列表', () => {
    withTempData((dir) => {
      const rss = readRssConfig(dir);
      rss.sources.push({
        name: '精选',
        url: 'https://a.com/rss',
        mode: 'curated',
        weight: 3,
        articles: [{ url: 'https://a.com/p/1', note: '推荐' }],
      });
      writeRssConfig(dir, rss);
      const back = readRssConfig(dir);
      expect(back.sources[1].articles![0].note).toBe('推荐');
      expect(listSnapshots(dir, 'rss.yaml')).toHaveLength(1);
    });
  });

  it('mode 非法 / sources 为空时拒绝写盘', () => {
    withTempData((dir) => {
      const rss = readRssConfig(dir);
      (rss.sources[0] as { mode: string }).mode = 'weird';
      expect(() => writeRssConfig(dir, rss)).toThrowError(/mode/);
      expect(readFileSync(path.join(dir, 'rss.yaml'), 'utf8')).toBe(RSS);

      const empty = readRssConfig(dir);
      empty.sources = [];
      expect(() => writeRssConfig(dir, empty)).toThrowError(/sources/);
    });
  });
});
