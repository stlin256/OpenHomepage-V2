import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSiteConfig, loadRssConfig, resolveAvatarPosition } from '../src/lib/config.ts';

const EXAMPLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/data');

/** 构造一个临时 data 目录，site.yaml 内容为给定 yaml 文本 */
function withTempData(files: Record<string, string>, fn: (dir: string) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'oh-data-'));
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

describe('loadSiteConfig', () => {
  it('正常加载 data.example/site.yaml', () => {
    const cfg = loadSiteConfig(EXAMPLE);
    expect(cfg.site.title).toBe('张三的主页');
    expect(cfg.profile.name).toBe('张三');
    expect(cfg.github.username).toBe('zhangsan');
    expect(cfg.github.pinned!).toHaveLength(2);
    expect(cfg.github.pinned![0].repo).toBe('zhangsan/awesome-project');
    expect(cfg.theme!.accent).toBe('#3a7bd5');
    expect(cfg.rss!.sources_file).toBe('rss.yaml');
    expect(cfg.home!.layout!.map((b: { block: string }) => b.block)).toEqual([
      'profile', 'markdown', 'streaming', 'github', 'rss',
    ]);
    expect(cfg.streaming_blocks![0].id).toBe('welcome');
  });

  it('保留双语映射字段原始形态', () => {
    const cfg = loadSiteConfig(EXAMPLE);
    expect(cfg.profile.tagline).toEqual({ zh: '博士研究生 / 方向：计算机系统', en: 'PhD candidate / Computer Systems' });
    expect(cfg.rss!.block_title).toEqual({ zh: '最近在读', en: 'Reading' });
  });

  it('site.yaml 不存在时报中文错误', () => {
    withTempData({}, (dir) => {
      expect(() => loadSiteConfig(dir)).toThrowError(/site\.yaml/);
    });
  });

  it('缺 profile.name 时报中文错误并指明字段', () => {
    withTempData({
      'site.yaml': 'site:\n  title: T\nprofile: {}\ngithub:\n  username: u\n',
    }, (dir) => {
      expect(() => loadSiteConfig(dir)).toThrowError(/profile\.name/);
    });
  });

  it('缺 github.username 时报中文错误', () => {
    withTempData({
      'site.yaml': 'site:\n  title: T\nprofile:\n  name: N\ngithub: {}\n',
    }, (dir) => {
      expect(() => loadSiteConfig(dir)).toThrowError(/github\.username/);
    });
  });

  it('YAML 语法错误时报中文错误', () => {
    withTempData({ 'site.yaml': 'site:\n  title: [未闭合\n' }, (dir) => {
      expect(() => loadSiteConfig(dir)).toThrowError(/YAML|解析/i);
    });
  });
});

describe('resolveAvatarPosition', () => {
  it('缺省/非法值回退 side；显式 top 生效', () => {
    const cfg = loadSiteConfig(EXAMPLE);
    expect(resolveAvatarPosition(cfg.profile)).toBe('side');
    expect(resolveAvatarPosition({ name: 'N', avatar_position: 'top' })).toBe('top');
    expect(
      resolveAvatarPosition({ name: 'N', avatar_position: 'left' as 'side' }),
    ).toBe('side');
  });
});

describe('loadRssConfig', () => {
  it('正常加载 data.example/rss.yaml', () => {
    const cfg = loadRssConfig(EXAMPLE);
    expect(cfg.display).toBe('grouped');
    expect(cfg.sources).toHaveLength(2);
    const [latest, curated] = cfg.sources;
    expect(latest.mode).toBe('latest');
    expect(latest.latest).toBe(5);
    expect(curated.mode).toBe('curated');
    expect(curated.articles!).toHaveLength(2);
    expect(curated.articles![0].note).toBe('推荐理由一句话');
    expect(curated.articles![0].cover).toBe('assets/rss/post-1.png');
  });

  it('rss.yaml 不存在时报中文错误', () => {
    withTempData({}, (dir) => {
      expect(() => loadRssConfig(dir)).toThrowError(/rss\.yaml/);
    });
  });

  it('sources 为空时报中文错误', () => {
    withTempData({ 'rss.yaml': 'display: grouped\nsources: []\n' }, (dir) => {
      expect(() => loadRssConfig(dir)).toThrowError(/sources/);
    });
  });

  it('source 缺 url 或 mode 非法时报中文错误', () => {
    withTempData({ 'rss.yaml': 'sources:\n  - name: x\n    mode: latest\n    latest: 3\n' }, (dir) => {
      expect(() => loadRssConfig(dir)).toThrowError(/url/);
    });
    withTempData({ 'rss.yaml': 'sources:\n  - name: x\n    url: https://a.com/feed\n    mode: weird\n' }, (dir) => {
      expect(() => loadRssConfig(dir)).toThrowError(/mode/);
    });
  });
});
