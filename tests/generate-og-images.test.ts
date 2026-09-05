/**
 * scripts/generate-og-images.ts 端到端单测：
 * - 经 tsx CLI 以子进程方式在 mkdtemp 临时目录中运行脚本（cwd 隔离，不触碰仓库 data/），
 *   覆盖 main() 的禁用分支、正常生成（SVG+PNG+缓存）、og_image 跳过、dist 同步、
 *   缓存命中回拷、空 pages、hexToRgb 容错分支与 catch 失败分支；
 * - sharp 在本机可用，故 PNG 走真实生成并以魔数校验，不做模块 mock。
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeOgHash } from '../src/lib/og-image.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TSX_CLI = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const SCRIPT = path.join(ROOT, 'scripts', 'generate-og-images.ts');

/** 子进程跑脚本：node + tsx CLI 直跑（避开 .cmd 壳，同 admin/server/build.ts） */
function runScript(cwd: string) {
  const r = spawnSync(process.execPath, [TSX_CLI, SCRIPT], {
    cwd,
    encoding: 'utf8',
    timeout: 60_000,
    windowsHide: true,
  });
  if (r.error) throw r.error;
  return r;
}

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

/** 建临时工作目录（含 data/），写 site.yaml 与各语言页面 */
function makeWorkspace(opts: {
  siteExtra?: string;
  pages?: { lang: string; file: string; frontmatter: string }[];
  withDist?: boolean;
}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'oh-oggen-'));
  tempDirs.push(dir);
  const dataDir = path.join(dir, 'data');
  mkdirSync(dataDir, { recursive: true });
  const site = [
    'site:',
    '  title: 测试站',
    '  description: 一个测试站点',
    '  language: zh',
    'profile:',
    '  name: 张三',
    'github:',
    '  username: zhangsan',
    opts.siteExtra ?? '',
    '',
  ].join('\n');
  writeFileSync(path.join(dataDir, 'site.yaml'), site);
  for (const p of opts.pages ?? []) {
    const langDir = path.join(dataDir, 'pages', p.lang);
    mkdirSync(langDir, { recursive: true });
    writeFileSync(path.join(langDir, p.file), `---\n${p.frontmatter}\n---\n正文\n`);
  }
  if (opts.withDist) mkdirSync(path.join(dir, 'dist'));
  return dir;
}

/** 校验文件为真实 PNG（魔数 0x89 'PNG'） */
function expectRealPng(file: string): void {
  const buf = readFileSync(file);
  expect(buf[0]).toBe(0x89);
  expect(buf.toString('latin1', 1, 4)).toBe('PNG');
}

const ogDir = (dir: string) => path.join(dir, 'public', 'assets', 'og');

describe('generate-og-images 脚本（子进程端到端）', () => {
  it('og_images.enabled=false：打印禁用日志并直接返回，不创建任何输出目录', { timeout: 90_000 }, () => {
    const dir = makeWorkspace({
      siteExtra: 'og_images:\n  enabled: false',
      pages: [{ lang: 'zh', file: 'index.md', frontmatter: 'title: 主页' }],
    });
    const r = runScript(dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('OG images generation disabled');
    expect(existsSync(ogDir(dir))).toBe(false);
    expect(existsSync(path.join(dir, '.cache', 'og-images'))).toBe(false);
  });

  it('正常生成：无 og_image 的页面产出 SVG+PNG+缓存；有 og_image 的页面跳过；无 dist 不同步', { timeout: 90_000 }, () => {
    const dir = makeWorkspace({
      pages: [
        { lang: 'zh', file: 'index.md', frontmatter: 'title: 主页\ndescription: 欢迎光临' },
        {
          lang: 'zh',
          file: 'custom.md',
          frontmatter: 'title: 自定义卡\nog_image: assets/custom-og.png',
        },
      ],
    });
    const r = runScript(dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('1 generated, 0 cached');

    // 与构建期同输入计算 hash，断言三处产物齐全
    const hash = computeOgHash({
      title: '主页',
      description: '欢迎光临',
      siteTitle: '测试站',
      lang: 'zh',
      accent: '#3a7bd5',
      background: '#f8f7f2',
    });
    const svgFile = path.join(ogDir(dir), `${hash}.svg`);
    expect(existsSync(svgFile)).toBe(true);
    expect(readFileSync(svgFile, 'utf8')).toContain('主页');
    expectRealPng(path.join(ogDir(dir), `${hash}.png`));
    expectRealPng(path.join(dir, '.cache', 'og-images', `${hash}.png`));
    // 未建 dist/：脚本不创建 dist 输出目录
    expect(existsSync(path.join(dir, 'dist', 'assets', 'og'))).toBe(false);
  });

  it('dist/ 存在时同步写入；第二次运行命中缓存并向 public/dist 回拷', { timeout: 120_000 }, () => {
    const dir = makeWorkspace({
      withDist: true,
      pages: [{ lang: 'zh', file: 'index.md', frontmatter: 'title: 主页\ndescription: 欢迎光临' }],
    });
    const hash = computeOgHash({
      title: '主页',
      description: '欢迎光临',
      siteTitle: '测试站',
      lang: 'zh',
      accent: '#3a7bd5',
      background: '#f8f7f2',
    });
    const distPng = path.join(dir, 'dist', 'assets', 'og', `${hash}.png`);
    const publicPng = path.join(ogDir(dir), `${hash}.png`);

    const r1 = runScript(dir);
    expect(r1.status).toBe(0);
    expect(r1.stdout).toContain('1 generated, 0 cached');
    expectRealPng(distPng);

    // 删除 public/dist 产物后重跑：缓存命中分支应把 .cache 里的 PNG 回拷到两处
    rmSync(publicPng);
    rmSync(distPng);
    const r2 = runScript(dir);
    expect(r2.status).toBe(0);
    expect(r2.stdout).toContain('0 generated, 1 cached');
    expectRealPng(publicPng);
    expectRealPng(distPng);
  });

  it('无 pages 目录：0 生成 0 缓存，仍创建 .cache 与 public 输出目录', { timeout: 90_000 }, () => {
    const dir = makeWorkspace({});
    const r = runScript(dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('0 generated, 0 cached');
    expect(existsSync(path.join(dir, '.cache', 'og-images'))).toBe(true);
    expect(existsSync(ogDir(dir))).toBe(true);
  });

  it('hexToRgb 容错：三位 hex 与非法 hex 背景色都能正常生成', { timeout: 120_000 }, () => {
    // 三位 hex 走 #rgb 展开分支
    const dir1 = makeWorkspace({
      siteExtra: "theme:\n  background: '#abc'",
      pages: [{ lang: 'zh', file: 'index.md', frontmatter: 'title: 主页' }],
    });
    const r1 = runScript(dir1);
    expect(r1.status).toBe(0);
    expect(r1.stdout).toContain('1 generated, 0 cached');

    // 非法 hex 走 parseInt NaN → || 248/247/242 回退分支
    const dir2 = makeWorkspace({
      siteExtra: "theme:\n  background: '#gggggg'",
      pages: [{ lang: 'zh', file: 'index.md', frontmatter: 'title: 主页' }],
    });
    const r2 = runScript(dir2);
    expect(r2.status).toBe(0);
    expect(r2.stdout).toContain('1 generated, 0 cached');
  });

  it('data/ 与 data.example/ 均缺失：main().catch 捕获并打印失败日志，非零退出', { timeout: 90_000 }, () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oh-oggen-'));
    tempDirs.push(dir);
    const r = runScript(dir);
    // catch 分支打印错误并以非零退出码结束（构建链按退出码判定阶段成败）
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('OG image generation failed');
  });
});
