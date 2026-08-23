import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSiteConfig, loadRssConfig, resolveAvatarPosition, resolveBgm, resolveFavicon, BGM_DEFAULT_VOLUME } from '../src/lib/config.ts';

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

describe('resolveFavicon（站点图标归一化，宽松校验）', () => {
  const base = { site: { title: 't' }, profile: { name: 'n' }, github: { username: 'u' } };

  it('未配置 / 空串 / 非法扩展名 → null（构建侧回退内置默认）', () => {
    expect(resolveFavicon(base)).toBeNull();
    expect(resolveFavicon({ ...base, site: { title: 't', favicon: '  ' } })).toBeNull();
    expect(resolveFavicon({ ...base, site: { title: 't', favicon: 'assets/f.mp4' } })).toBeNull();
    expect(resolveFavicon({ ...base, site: { title: 't', favicon: 'assets/f' } })).toBeNull();
  });

  it('svg/png/ico（大小写不敏感）正常返回', () => {
    expect(resolveFavicon({ ...base, site: { title: 't', favicon: 'assets/favicon.svg' } })).toBe(
      'assets/favicon.svg',
    );
    expect(resolveFavicon({ ...base, site: { title: 't', favicon: 'assets/icon.PNG' } })).toBe(
      'assets/icon.PNG',
    );
    expect(resolveFavicon({ ...base, site: { title: 't', favicon: 'assets/f.ico' } })).toBe(
      'assets/f.ico',
    );
  });

  it('示例配置（夹具）声明了 favicon 且文件存在', () => {
    const cfg = loadSiteConfig(EXAMPLE);
    const favicon = resolveFavicon(cfg);
    expect(favicon).toBe('assets/favicon.svg');
    expect(existsSync(path.join(EXAMPLE, favicon!))).toBe(true);
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

describe('resolveBgm（背景音乐配置归一化，宽松校验）', () => {
  const base = { site: { title: 't' }, profile: { name: 'n' }, github: { username: 'u' } };

  it('缺省（无 bgm 段）/ 无 file / 显式 enabled:false → 禁用（null）', () => {
    expect(resolveBgm(base)).toBeNull();
    expect(resolveBgm({ ...base, bgm: { enabled: true } })).toBeNull();
    expect(resolveBgm({ ...base, bgm: { file: '  ' } })).toBeNull();
    expect(
      resolveBgm({ ...base, bgm: { file: 'assets/bgm.wav', enabled: false } }),
    ).toBeNull();
    expect(resolveBgm({ ...base, bgm: null as unknown as undefined })).toBeNull();
  });

  it('file + 未显式关闭即启用；volume 缺省回退默认值', () => {
    expect(resolveBgm({ ...base, bgm: { file: 'assets/bgm.wav' } })).toEqual({
      file: 'assets/bgm.wav',
      volume: BGM_DEFAULT_VOLUME,
    });
    expect(
      resolveBgm({ ...base, bgm: { file: 'assets/bgm.wav', volume: 0.4, enabled: true } }),
    ).toEqual({ file: 'assets/bgm.wav', volume: 0.4 });
  });

  it('volume 非法/越界时回退或 clamp 到 [0,1]', () => {
    expect(
      resolveBgm({ ...base, bgm: { file: 'a.mp3', volume: 'loud' as unknown as number } })!.volume,
    ).toBe(BGM_DEFAULT_VOLUME);
    expect(resolveBgm({ ...base, bgm: { file: 'a.mp3', volume: 1.8 } })!.volume).toBe(1);
    expect(resolveBgm({ ...base, bgm: { file: 'a.mp3', volume: -0.5 } })!.volume).toBe(0);
    expect(resolveBgm({ ...base, bgm: { file: 'a.mp3', volume: NaN } })!.volume).toBe(
      BGM_DEFAULT_VOLUME,
    );
  });
});
