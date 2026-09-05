/**
 * scripts/sync-version.mjs（npm version 生命周期钩子）测试：
 * 在临时目录复制脚本本体，构造最小 package.json / package-lock.json 与
 * data.example/pages 样本，用 node 子进程执行，断言 lock 版本校验
 * （含失败退出码分支）与 about.md 硬编码版本胶囊 → v{{version}} 自愈行为。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../scripts/sync-version.mjs',
);

/** 子进程跑脚本，返回退出码与输出（脚本的 root 由脚本自身位置推导） */
function runScript(scriptPath: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [scriptPath], { timeout: 30_000 }, (err, stdout, stderr) => {
      // err.code 为数字时是正常退出码（含非零）；字符串（如 ENOENT）才是真失败
      if (err && typeof err.code !== 'number') return reject(err);
      resolve({ code: err ? (err.code as number) : 0, stdout, stderr });
    });
  });
}

/** 临时 root：scripts/sync-version.mjs 副本 + 可写 package.json / lock */
function makeRoot(): { root: string; script: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'oh-syncver-'));
  mkdirSync(path.join(root, 'scripts'));
  const script = path.join(root, 'scripts', 'sync-version.mjs');
  copyFileSync(REPO_SCRIPT, script);
  return { root, script };
}

function writeManifests(root: string, pkgVersion: string, lockVersion: string): void {
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'tmp', version: pkgVersion }));
  writeFileSync(
    path.join(root, 'package-lock.json'),
    JSON.stringify({ name: 'tmp', version: lockVersion }),
  );
}

function writeAbout(root: string, lang: string, content: string): string {
  const dir = path.join(root, 'data.example', 'pages', lang);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'about.md');
  writeFileSync(file, content);
  return file;
}

const CAPSULE = '<span class="version-label">v1.2.3</span>';
const PLACEHOLDER = '<span class="version-label">v{{version}}</span>';

const tmpRoots: string[] = [];
afterEach(() => {
  while (tmpRoots.length) rmSync(tmpRoots.pop()!, { recursive: true, force: true });
});

describe('sync-version.mjs', () => {
  it('lock 与 package.json 版本不一致 → 退出码 1，stderr 报两个版本号', async () => {
    const { root, script } = makeRoot();
    tmpRoots.push(root);
    writeManifests(root, '0.4.0', '0.3.0');
    const about = writeAbout(root, 'zh', CAPSULE);

    const r = await runScript(script);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('版本不一致');
    expect(r.stderr).toContain('package.json=0.4.0');
    expect(r.stderr).toContain('package-lock.json=0.3.0');
    // 校验失败提前退出，不触发自愈改写
    expect(readFileSync(about, 'utf8')).toBe(CAPSULE);
  });

  it('版本一致 + about.md 残留硬编码胶囊 → 自愈为 v{{version}} 占位符', async () => {
    const { root, script } = makeRoot();
    tmpRoots.push(root);
    writeManifests(root, '0.3.0', '0.3.0');
    const about = writeAbout(root, 'zh', `# 关于\n\n${CAPSULE}\n`);

    const r = await runScript(script);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('已将');
    expect(r.stdout).toContain('about.md');
    expect(r.stdout).not.toContain('无硬编码版本号');
    expect(readFileSync(about, 'utf8')).toBe(`# 关于\n\n${PLACEHOLDER}\n`);
  });

  it('已是 v{{version}} 占位符 → 不改写，提示无硬编码', async () => {
    const { root, script } = makeRoot();
    tmpRoots.push(root);
    writeManifests(root, '0.3.0', '0.3.0');
    const about = writeAbout(root, 'zh', PLACEHOLDER);

    const r = await runScript(script);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('无硬编码版本号');
    expect(r.stdout).toContain('v0.3.0');
    expect(readFileSync(about, 'utf8')).toBe(PLACEHOLDER);
  });

  it('data.example/pages 目录不存在 → 跳过自愈，提示无硬编码', async () => {
    const { root, script } = makeRoot();
    tmpRoots.push(root);
    writeManifests(root, '0.3.0', '0.3.0');

    const r = await runScript(script);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('无硬编码版本号');
  });

  it('语言目录缺 about.md / 版本号未被 span 包裹 → 均不改写', async () => {
    const { root, script } = makeRoot();
    tmpRoots.push(root);
    writeManifests(root, '0.3.0', '0.3.0');
    // 只有目录、没有 about.md
    mkdirSync(path.join(root, 'data.example', 'pages', 'ja'), { recursive: true });
    // 裸版本号不匹配正则不匹配（需 version-label span 包裹）
    const bare = writeAbout(root, 'en', '当前版本 v1.2.3 欢迎使用');

    const r = await runScript(script);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('无硬编码版本号');
    expect(readFileSync(bare, 'utf8')).toBe('当前版本 v1.2.3 欢迎使用');
  });

  it('多语言混合：只改写命中胶囊的语言，其余原样保留', async () => {
    const { root, script } = makeRoot();
    tmpRoots.push(root);
    writeManifests(root, '0.3.0', '0.3.0');
    const zh = writeAbout(root, 'zh', CAPSULE);
    const en = writeAbout(root, 'en', PLACEHOLDER);

    const r = await runScript(script);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('已将');
    expect(readFileSync(zh, 'utf8')).toBe(PLACEHOLDER);
    expect(readFileSync(en, 'utf8')).toBe(PLACEHOLDER);
  });
});
