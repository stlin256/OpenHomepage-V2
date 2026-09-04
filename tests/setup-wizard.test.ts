/**
 * setup 向导（scripts/setup-lib.mjs + scripts/setup.mjs）单测，见 docs/specs/15-setup-wizard.md。
 * 全部在临时目录内操作，不触碰仓库真实 data/。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, cpSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';
import {
  parseCliArgs,
  isNonInteractive,
  trimLangMaps,
  transformSiteConfig,
  stripModuleDirectives,
  generateQuickData,
  generateBlankData,
  runSetup,
  GITHUB_USERNAME_PLACEHOLDER,
} from '../scripts/setup-lib.mjs';
import { loadSiteConfig } from '../src/lib/config.ts';

const root = path.resolve(import.meta.dirname, '..');
const exampleDir = path.join(root, 'data.example');

const tmpDirs: string[] = [];
function makeTmp(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'oh-setup-'));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

function readSite(dataDir: string): any {
  return loadYaml(readFileSync(path.join(dataDir, 'site.yaml'), 'utf8'));
}

const ALL_ON = { publications: true, github: true, rss: true, bgm: true, contact: true };
const ALL_OFF = { publications: false, github: false, rss: false, bgm: false, contact: false };

describe('parseCliArgs / isNonInteractive（纯函数）', () => {
  it('解析 --example / --blank / --yes', () => {
    expect(parseCliArgs([])).toEqual({ example: false, blank: false, yes: false });
    expect(parseCliArgs(['--example'])).toEqual({ example: true, blank: false, yes: false });
    expect(parseCliArgs(['--blank', '--yes'])).toEqual({ example: false, blank: true, yes: true });
  });

  it('非交互判定：参数 / CI=true / 非 TTY 任一成立即非交互', () => {
    const base = { isTTY: true, env: {} as NodeJS.ProcessEnv, args: parseCliArgs([]) };
    expect(isNonInteractive(base)).toBe(false);
    expect(isNonInteractive({ ...base, isTTY: false })).toBe(true);
    expect(isNonInteractive({ ...base, env: { CI: 'true' } as NodeJS.ProcessEnv })).toBe(true);
    expect(isNonInteractive({ ...base, args: parseCliArgs(['--yes']) })).toBe(true);
    expect(isNonInteractive({ ...base, args: parseCliArgs(['--example']) })).toBe(true);
    expect(isNonInteractive({ ...base, args: parseCliArgs(['--blank']) })).toBe(true);
  });
});

describe('trimLangMaps / transformSiteConfig / stripModuleDirectives（纯函数）', () => {
  it('trimLangMaps：多语言映射只保留选中语言，普通对象原样递归', () => {
    const input = {
      title: { zh: '林知远', en: 'Zhiyuan Lin', ja: '林知远', fr: 'Zhiyuan Lin' },
      nested: { list: [{ note: { zh: '中', en: 'en', ja: '日', fr: '法' }, year: 2026 }] },
      plain: { block: 'github' },
    };
    const out = trimLangMaps(input, ['zh', 'en']);
    expect(out.title).toEqual({ zh: '林知远', en: 'Zhiyuan Lin' });
    expect(out.nested.list[0].note).toEqual({ zh: '中', en: 'en' });
    expect(out.plain).toEqual({ block: 'github' });
    // 不改入参
    expect(Object.keys(input.title)).toHaveLength(4);
  });

  it('trimLangMaps：选中语言全不命中时保留首个可用语言兜底', () => {
    expect(trimLangMaps({ ja: '日', fr: '法' }, ['en'])).toEqual({ ja: '日' });
  });

  it('transformSiteConfig：写入姓名/Tagline/GitHub，裁剪语言与模块，github 段保留最小 username', () => {
    const cfg = readSite(exampleDir);
    const out = transformSiteConfig(cfg, {
      nameZh: '张三',
      nameEn: 'San Zhang',
      taglineZh: '工程师',
      taglineEn: 'Engineer',
      githubUser: 'octocat-dev',
      langs: ['zh', 'en'],
      modules: ALL_OFF,
    });
    expect(out.profile.name).toEqual({ zh: '张三', en: 'San Zhang' });
    expect(out.site.title).toEqual({ zh: '张三', en: 'San Zhang' });
    expect(out.profile.tagline).toEqual({ zh: '工程师', en: 'Engineer' });
    expect(out.site.language).toBe('zh-CN');
    expect(out.github).toEqual({ username: 'octocat-dev' });
    expect(out.rss).toBeUndefined();
    expect(out.bgm).toBeUndefined();
    expect(out.contact).toBeUndefined();
    // home.layout 中 github/rss 区块被移除，其余保留
    const blocks = out.home.layout.map((b: any) => b.block);
    expect(blocks).not.toContain('github');
    expect(blocks).not.toContain('rss');
    expect(blocks).toContain('profile');
    // 四语映射被裁到 zh/en（抽查 editorial_blocks 的 note）
    expect(Object.keys(out.editorial_blocks[0].title).sort()).toEqual(['en', 'zh']);
  });

  it('transformSiteConfig：仅英文时 site.language=en，留空 GitHub 用户名用占位符', () => {
    const out = transformSiteConfig(readSite(exampleDir), {
      nameZh: '张三',
      nameEn: 'San Zhang',
      taglineZh: '',
      taglineEn: '',
      githubUser: '  ',
      langs: ['en'],
      modules: ALL_ON,
    });
    expect(out.site.language).toBe('en');
    expect(out.profile.name).toEqual({ en: 'San Zhang' });
    expect(out.github.username).toBe(GITHUB_USERNAME_PLACEHOLDER);
  });

  it('stripModuleDirectives：剥离独立成行的叶子指令，保留容器围栏与普通行', () => {
    const md = [
      '前文',
      ':::ghcard{repo="a/b"}',
      '',
      '::publications{limit="3"}',
      '::::grid{cols=2}',
      '::::',
      '行内提到 ::ghcard 不算',
    ].join('\n');
    const out = stripModuleDirectives(md, ['ghcard', 'publications']);
    expect(out).not.toContain(':::ghcard{');
    expect(out).not.toContain('::publications{');
    expect(out).toContain('::::grid{cols=2}');
    expect(out).toContain('行内提到 ::ghcard 不算');
  });
});

describe('generateQuickData（临时目录）', () => {
  it('中英双语 + 全模块关闭：目录结构、文件删除、指令剥离、site.yaml 校验通过', () => {
    const destDir = path.join(makeTmp(), 'data');
    generateQuickData(
      {
        nameZh: '张三',
        nameEn: 'San Zhang',
        taglineZh: '工程师',
        taglineEn: 'Engineer',
        githubUser: 'octocat-dev',
        langs: ['zh', 'en'],
        modules: ALL_OFF,
      },
      { exampleDir, destDir },
    );
    // 语言裁剪：pages/ 与 streaming/ 只剩 zh/en
    expect(readdirSync(path.join(destDir, 'pages')).sort()).toEqual(['en', 'zh']);
    expect(readdirSync(path.join(destDir, 'streaming')).sort()).toEqual(['en', 'zh']);
    // 模块文件删除
    expect(existsSync(path.join(destDir, 'publications.yaml'))).toBe(false);
    expect(existsSync(path.join(destDir, 'publications.bib'))).toBe(false);
    expect(existsSync(path.join(destDir, 'rss.yaml'))).toBe(false);
    // 页面指令剥离
    const features = readFileSync(path.join(destDir, 'pages', 'zh', 'features.md'), 'utf8');
    expect(features).not.toContain('::publications{');
    expect(features).not.toContain('::ghcard{');
    const research = readFileSync(path.join(destDir, 'pages', 'en', 'research.md'), 'utf8');
    expect(research).not.toContain('::ghcard{');
    // site.yaml 通过真实加载校验
    const cfg = loadSiteConfig(destDir);
    expect(cfg.profile.name).toEqual({ zh: '张三', en: 'San Zhang' });
    expect(cfg.github.username).toBe('octocat-dev');
    expect(cfg.rss).toBeUndefined();
  });

  it('仅中文 + 全模块保留：只留 pages/zh，指令与模块文件原样保留', () => {
    const destDir = path.join(makeTmp(), 'data');
    generateQuickData(
      { nameZh: '', nameEn: '', taglineZh: '', taglineEn: '', githubUser: '', langs: ['zh'], modules: ALL_ON },
      { exampleDir, destDir },
    );
    expect(readdirSync(path.join(destDir, 'pages'))).toEqual(['zh']);
    expect(existsSync(path.join(destDir, 'publications.yaml'))).toBe(true);
    expect(existsSync(path.join(destDir, 'rss.yaml'))).toBe(true);
    const features = readFileSync(path.join(destDir, 'pages', 'zh', 'features.md'), 'utf8');
    expect(features).toContain('::publications{');
    const about = readFileSync(path.join(destDir, 'pages', 'zh', 'about.md'), 'utf8');
    expect(about).toContain('::ghcard{');
    const cfg = loadSiteConfig(destDir);
    expect(cfg.site.language).toBe('zh-CN');
    expect(Object.keys(cfg.profile.name)).toEqual(['zh']);
  });
});

describe('generateBlankData（临时目录）', () => {
  it('生成最小骨架并通过 loadSiteConfig 校验', () => {
    const destDir = path.join(makeTmp(), 'data');
    generateBlankData(destDir, { lang: 'zh', name: '张三', githubUser: 'octocat-dev' });
    expect(existsSync(path.join(destDir, 'site.yaml'))).toBe(true);
    expect(existsSync(path.join(destDir, 'pages', 'zh', 'index.md'))).toBe(true);
    const cfg = loadSiteConfig(destDir);
    expect(cfg.profile.name).toEqual({ zh: '张三' });
    expect(cfg.github.username).toBe('octocat-dev');
    // 无名/无 GitHub 输入时用占位符
    const dest2 = path.join(makeTmp(), 'data');
    generateBlankData(dest2);
    expect(loadSiteConfig(dest2).github.username).toBe(GITHUB_USERNAME_PLACEHOLDER);
  });
});

describe('runSetup 编排（临时目录）', () => {
  /** 造一个伪 root：只需 data.example 子目录 */
  function makeFakeRoot(): string {
    const rootDir = makeTmp();
    cpSync(exampleDir, path.join(rootDir, 'data.example'), { recursive: true });
    return rootDir;
  }

  it('data/ 已存在 → skipped，不改动目录内容', async () => {
    const rootDir = makeFakeRoot();
    const dataDir = path.join(rootDir, 'data');
    mkdirSync(dataDir);
    writeFileSync(path.join(dataDir, 'keep.txt'), 'do not touch');
    const result = await runSetup({ rootDir, argv: ['--blank'], env: {}, isTTY: false });
    expect(result.mode).toBe('skipped');
    expect(readFileSync(path.join(dataDir, 'keep.txt'), 'utf8')).toBe('do not touch');
    expect(readdirSync(dataDir)).toEqual(['keep.txt']);
  });

  it('非 TTY 无参数 → 回退完整示例复制（CI 兼容旧行为）', async () => {
    const rootDir = makeFakeRoot();
    const result = await runSetup({ rootDir, argv: [], env: {}, isTTY: false });
    expect(result.mode).toBe('example');
    const dataDir = path.join(rootDir, 'data');
    expect(readdirSync(path.join(dataDir, 'pages')).sort()).toEqual(['en', 'fr', 'ja', 'zh']);
    // 完整示例不重写 site.yaml（注释保留）
    expect(readFileSync(path.join(dataDir, 'site.yaml'), 'utf8')).toContain('# ---- 站点基本信息 ----');
  });

  it('CI=true 且 TTY → 仍回退完整示例', async () => {
    const rootDir = makeFakeRoot();
    const result = await runSetup({ rootDir, argv: [], env: { CI: 'true' }, isTTY: true });
    expect(result.mode).toBe('example');
    expect(existsSync(path.join(rootDir, 'data', 'site.yaml'))).toBe(true);
  });

  it('--blank → 空白骨架；--yes → 完整示例', async () => {
    const rootDir = makeFakeRoot();
    const r1 = await runSetup({ rootDir, argv: ['--blank'], env: {}, isTTY: true });
    expect(r1.mode).toBe('blank');
    expect(existsSync(path.join(rootDir, 'data', 'pages', 'zh', 'index.md'))).toBe(true);

    const rootDir2 = makeFakeRoot();
    const r2 = await runSetup({ rootDir: rootDir2, argv: ['--yes'], env: {}, isTTY: true });
    expect(r2.mode).toBe('example');
    expect(readdirSync(path.join(rootDir2, 'data', 'pages')).sort()).toEqual(['en', 'fr', 'ja', 'zh']);
  });

  it('交互路径：ask 返回 quick 选项时按选项生成', async () => {
    const rootDir = makeFakeRoot();
    const result = await runSetup({
      rootDir,
      argv: [],
      env: {},
      isTTY: true,
      ask: async () => ({
        mode: 'quick' as const,
        options: {
          nameZh: '李四',
          nameEn: 'Si Li',
          taglineZh: '',
          taglineEn: '',
          githubUser: 'si-li',
          langs: ['zh'],
          modules: ALL_OFF,
        },
      }),
    });
    expect(result.mode).toBe('quick');
    const dataDir = path.join(rootDir, 'data');
    expect(readdirSync(path.join(dataDir, 'pages'))).toEqual(['zh']);
    expect(loadSiteConfig(dataDir).github.username).toBe('si-li');
  });
});
