/**
 * 发布视图服务端（spec 21）单测：
 * - 构建状态机（admin/server/build.ts）：假 spawn 替身验证阶段推进/冲突/失败/取消，不真跑构建；
 * - dist 预览管理（admin/server/preview.ts）：假 probe/createServer 验证幂等/接管/关闭；
 * - OG 分享卡预览（admin/server/og-preview.ts）：临时 data 目录验证 SVG 生成与自定义 og_image 分支。
 */
import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ChildProcess, spawn } from 'node:child_process';
import {
  buildStages,
  createBuildManager,
  BuildConflictError,
  type BuildDeps,
} from '../admin/server/build.ts';
import {
  createPreviewManager,
  PREVIEW_PORT,
  type PreviewServerLike,
} from '../admin/server/preview.ts';
import { renderOgPreview } from '../admin/server/og-preview.ts';

/** 假子进程（同 admin-devserver.test.ts 模式）：stdout/stderr 为事件源，exit 手动触发 */
class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  pid = 9999;
  exitCode: number | null = null;
  killed = false;
  kill(): boolean {
    this.killed = true;
    this.exit(0);
    return true;
  }
  exit(code = 0): void {
    if (this.exitCode !== null) return;
    this.exitCode = code;
    queueMicrotask(() => this.emit('exit', code));
  }
}

function makeBuildDeps(overrides: Partial<BuildDeps> = {}) {
  const children: FakeChild[] = [];
  const calls: { command: string; args: string[] }[] = [];
  const spawnImpl = ((command: string, args: string[]) => {
    calls.push({ command, args });
    if (command === 'taskkill') {
      const tk = new FakeChild();
      queueMicrotask(() => {
        tk.exit(0);
        children.at(-1)?.exit(0);
      });
      return tk as unknown as ChildProcess;
    }
    const c = new FakeChild();
    children.push(c);
    return c as unknown as ChildProcess;
  }) as typeof spawn;
  const deps: BuildDeps = {
    spawn: spawnImpl,
    platform: 'linux',
    execPath: '/usr/bin/node',
    ...overrides,
  };
  return { deps, children, calls };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe('buildStages（纯函数）', () => {
  it('五个阶段，顺序与 scripts.build 一致，node 直跑 tsx/astro CLI', () => {
    const stages = buildStages('/proj', '/usr/bin/node');
    expect(stages.map((s) => s.id)).toEqual(['fonts', 'og', 'astro', 'css', 'images']);
    const tsx = path.join('/proj', 'node_modules', 'tsx', 'dist', 'cli.mjs');
    expect(stages[0].args).toEqual([tsx, 'scripts/generate-fonts.ts']);
    expect(stages[1].args).toEqual([tsx, 'scripts/generate-og-images.ts']);
    expect(stages[2].args).toEqual([
      path.join('/proj', 'node_modules', 'astro', 'bin', 'astro.mjs'),
      'build',
    ]);
    expect(stages[3].args).toEqual([tsx, 'scripts/optimize-critical-css.ts']);
    expect(stages[4].args).toEqual([tsx, 'scripts/optimize-images.ts']);
    for (const s of stages) {
      expect(s.command).toBe('/usr/bin/node');
      expect(s.cwd).toBe('/proj');
    }
  });
});

describe('createBuildManager 状态机', () => {
  it('start：逐阶段推进，全部退出码 0 后 success', async () => {
    const { deps, children, calls } = makeBuildDeps();
    const m = createBuildManager({ rootDir: '/proj', deps });
    const s0 = m.start();
    expect(s0.status).toBe('running');
    expect(s0.stageIndex).toBe(0);
    expect(calls).toHaveLength(1);
    expect(children[0].stdout.listenerCount('data')).toBeGreaterThan(0);

    for (let i = 0; i < 4; i++) {
      children[i].exit(0);
      await tick();
      expect(m.status().status).toBe('running');
      expect(m.status().stageIndex).toBe(i + 1);
    }
    children[4].exit(0);
    await tick();
    const done = m.status();
    expect(done.status).toBe('success');
    expect(done.stageIndex).toBe(-1);
    expect(done.error).toBeNull();
    expect(done.startedAt).toBeTruthy();
    expect(done.finishedAt).toBeTruthy();
    expect(calls).toHaveLength(5);
  });

  it('进行中再次 start 抛 BuildConflictError（http 层映射 409）', () => {
    const { deps } = makeBuildDeps();
    const m = createBuildManager({ rootDir: '/proj', deps });
    m.start();
    expect(() => m.start()).toThrowError(BuildConflictError);
  });

  it('某阶段非零退出：failed + error 含阶段 id，不再推进；可重新 start', async () => {
    const { deps, children, calls } = makeBuildDeps();
    const m = createBuildManager({ rootDir: '/proj', deps });
    m.start();
    children[0].exit(0);
    await tick();
    children[1].exit(1);
    await tick();
    const s = m.status();
    expect(s.status).toBe('failed');
    expect(s.error).toContain('og');
    expect(calls).toHaveLength(2);

    m.start();
    expect(m.status().status).toBe('running');
    expect(calls).toHaveLength(3);
  });

  it('日志尾部捕获子进程 stdout 并按行缓冲（含阶段头）', async () => {
    const { deps, children } = makeBuildDeps();
    const m = createBuildManager({ rootDir: '/proj', deps });
    m.start();
    children[0].stdout.emit('data', Buffer.from('字体子集完成\n第二行\n'));
    const tail = m.status().logTail;
    expect(tail[0]).toBe('▶ fonts');
    expect(tail).toContain('字体子集完成');
    expect(tail).toContain('第二行');
  });

  it('stop：杀进行中的子进程树，状态回 idle，可重新 start', async () => {
    const { deps, children, calls } = makeBuildDeps();
    const m = createBuildManager({ rootDir: '/proj', deps });
    m.start();
    const s = await m.stop();
    expect(children[0].killed).toBe(true);
    expect(s.status).toBe('idle');
    m.start();
    expect(calls.filter((c) => c.command !== 'taskkill')).toHaveLength(2);
  });

  it('空闲时 stop 为空操作', async () => {
    const { deps, calls } = makeBuildDeps();
    const m = createBuildManager({ rootDir: '/proj', deps });
    const s = await m.stop();
    expect(s.status).toBe('idle');
    expect(calls).toHaveLength(0);
  });
});

// ---- dist 预览管理 ----

class FakeServer implements PreviewServerLike {
  listened: { port: number; host: string } | null = null;
  closed = false;
  private errorCb: ((e: Error) => void) | null = null;
  listen(port: number, host: string, cb: () => void): void {
    this.listened = { port, host };
    queueMicrotask(cb);
  }
  close(cb?: (err?: Error) => void): void {
    this.closed = true;
    cb?.();
  }
  on(_event: 'error', cb: (e: Error) => void): void {
    this.errorCb = cb;
  }
}

function makePreviewDeps(opts: { probeHost?: string | null; server?: FakeServer }) {
  const created: FakeServer[] = [];
  return {
    created,
    deps: {
      probe: async () => opts.probeHost ?? null,
      createServer: () => {
        const s = opts.server ?? new FakeServer();
        created.push(s);
        return s;
      },
    },
  };
}

describe('createPreviewManager', () => {
  it('start：dist 存在时启动 HTTP 服务（127.0.0.1 + 端口），probe 通后 up', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oh-preview-'));
    mkdirSync(path.join(dir, 'dist'));
    try {
      let listening = false;
      const server = new FakeServer();
      const origListen = server.listen.bind(server);
      server.listen = (port, host, cb) => {
        listening = true;
        origListen(port, host, cb);
      };
      const { deps, created } = makePreviewDeps({ server });
      deps.probe = async () => (listening ? '127.0.0.1' : null);
      const m = createPreviewManager({ rootDir: dir, deps });
      const s = await m.start();
      expect(created).toHaveLength(1);
      expect(server.listened).toEqual({ port: PREVIEW_PORT, host: '127.0.0.1' });
      expect(s.up).toBe(true);
      expect(s.managed).toBe(true);
      expect(s.url).toBe(`http://127.0.0.1:${PREVIEW_PORT}/`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('start 幂等：已启动时不重复创建；stop 关闭服务', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oh-preview-'));
    mkdirSync(path.join(dir, 'dist'));
    try {
      const { deps, created } = makePreviewDeps({});
      const m = createPreviewManager({ rootDir: dir, deps });
      await m.start();
      await m.start();
      expect(created).toHaveLength(1);
      const s = await m.stop();
      expect(created[0].closed).toBe(true);
      expect(s.managed).toBe(false);
      expect(s.up).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('端口被外部服务占用：接管上报 up + managed=false，不创建服务，stop 不动它', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oh-preview-'));
    mkdirSync(path.join(dir, 'dist'));
    try {
      const { deps, created } = makePreviewDeps({ probeHost: '::1' });
      const m = createPreviewManager({ rootDir: dir, deps });
      const s = await m.start();
      expect(created).toHaveLength(0);
      expect(s.up).toBe(true);
      expect(s.managed).toBe(false);
      expect(s.url).toBe(`http://[::1]:${PREVIEW_PORT}/`);
      const after = await m.stop();
      expect(created).toHaveLength(0);
      expect(after.up).toBe(true); // 外部服务不受影响
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('dist/ 不存在：不启动，error 提示先构建', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oh-preview-'));
    try {
      const { deps, created } = makePreviewDeps({});
      const m = createPreviewManager({ rootDir: dir, deps });
      const s = await m.start();
      expect(created).toHaveLength(0);
      expect(s.up).toBe(false);
      expect(s.error).toContain('dist');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---- OG 分享卡预览 ----

const SITE = [
  'site:',
  '  title: 测试站',
  '  description: 一个测试站点',
  'profile:',
  '  name: 张三',
  'github:',
  '  username: zhangsan',
  'theme:',
  '  accent: "#3a7bd5"',
  '',
].join('\n');

function withOgData(fn: (dir: string) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'oh-og-'));
  try {
    writeFileSync(path.join(dir, 'site.yaml'), SITE);
    mkdirSync(path.join(dir, 'pages', 'zh'), { recursive: true });
    writeFileSync(
      path.join(dir, 'pages', 'zh', 'index.md'),
      '---\ntitle: 主页\ndescription: 欢迎光临\n---\n正文\n'
    );
    writeFileSync(
      path.join(dir, 'pages', 'zh', 'custom.md'),
      '---\ntitle: 自定义卡\nog_image: assets/custom-og.png\n---\n正文\n'
    );
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('renderOgPreview', () => {
  it('普通页面：返回与构建期同输入的 SVG（含标题/站点名/描述）', () => {
    withOgData((dir) => {
      const r = renderOgPreview(dir, 'zh', 'index.md');
      expect(r.custom).toBeNull();
      expect(r.title).toBe('主页');
      expect(r.svg).toContain('<svg');
      expect(r.svg).toContain('主页');
      expect(r.svg).toContain('测试站');
      expect(r.svg).toContain('欢迎光临');
      expect(r.svg).toContain('#3a7bd5');
    });
  });

  it('自定义 og_image 的页面：不生成 SVG，回传 custom 路径（与构建期跳过一致）', () => {
    withOgData((dir) => {
      const r = renderOgPreview(dir, 'zh', 'custom.md');
      expect(r.svg).toBeNull();
      expect(r.custom).toBe('assets/custom-og.png');
    });
  });

  it('页面不存在 / 非法参数：抛错（http 层 400）', () => {
    withOgData((dir) => {
      expect(() => renderOgPreview(dir, 'zh', 'missing.md')).toThrowError(/不存在/);
      expect(() => renderOgPreview(dir, 'zh', '../site.yaml')).toThrowError(/非法/);
      expect(() => renderOgPreview(dir, '', 'index.md')).toThrowError(/非法/);
    });
  });
});
