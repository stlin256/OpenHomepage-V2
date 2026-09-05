/**
 * 自动打开浏览器（spec 20，admin/server/open-browser.ts）单测：
 * - buildOpenCommand 纯函数：Windows / macOS / Linux 及未知平台回退的命令构造；
 * - openBrowser：vi.mock('node:child_process') 拦截 spawn（绝不真实打开浏览器），
 *   验证 detached + stdio ignore + unref + error 监听，以及「spawn 同步抛错」
 *   与「子进程 error 事件」两条静默降级分支；
 * - index.ts 入口的 ADMIN_NO_OPEN=1 禁用分支（esbuild/http/devserver 等重依赖全部 mock，
 *   listen 回调同步触发，不起真实服务、不碰真实 data/）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { buildOpenCommand, openBrowser } from '../admin/server/open-browser.ts';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

// index.ts 入口的重依赖替身：esbuild 内存打包 / data 目录初始化 / http 服务 /
// dev server / 构建与预览管理 / Markdown 预热，全部不真跑
vi.mock('esbuild', () => ({
  build: vi.fn(async () => ({ outputFiles: [{ text: '' }] })),
}));
vi.mock('../admin/server/setup.ts', () => ({
  ensureDataDir: () => ({ dataDir: '/nonexistent-data', initialized: false }),
}));
vi.mock('../admin/server/http.ts', () => ({
  createAdminServer: () => ({
    listen: (_port: number, _host: string, cb: () => void) => cb(),
    close: () => {},
  }),
}));
vi.mock('../admin/server/devserver.ts', () => ({
  createDevServerManager: () => ({
    // 永不 resolve：跳过启动后的状态轮询循环（那里带 1s 真实定时器）
    start: () => new Promise(() => {}),
    status: async () => ({ up: false }),
    stop: async () => {},
  }),
}));
vi.mock('../admin/server/build.ts', () => ({
  createBuildManager: () => ({ stop: async () => {} }),
}));
vi.mock('../admin/server/preview.ts', () => ({
  createPreviewManager: () => ({ stop: async () => {} }),
}));
vi.mock('../src/lib/markdown.ts', () => ({ renderMarkdown: async () => '' }));
vi.mock('../src/lib/base-url.ts', () => ({ getBaseUrl: () => 'http://127.0.0.1/' }));

const spawnMock = vi.mocked(spawn);

/** 假子进程：仅实现 openBrowser 用到的 on / unref */
function makeFakeChild() {
  return { on: vi.fn(), unref: vi.fn() };
}

type FakeChild = ReturnType<typeof makeFakeChild>;

function mockSpawnReturns(child: FakeChild): void {
  spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);
}

describe('buildOpenCommand：按平台构造打开 URL 的命令', () => {
  it('Windows：cmd /c start "" <url>（空串是 start 的窗口标题占位）', () => {
    expect(buildOpenCommand('win32', 'http://127.0.0.1:4174')).toEqual({
      command: 'cmd',
      args: ['/c', 'start', '""', 'http://127.0.0.1:4174'],
    });
  });

  it('macOS：open <url>', () => {
    expect(buildOpenCommand('darwin', 'http://127.0.0.1:4174')).toEqual({
      command: 'open',
      args: ['http://127.0.0.1:4174'],
    });
  });

  it('Linux：xdg-open <url>', () => {
    expect(buildOpenCommand('linux', 'http://127.0.0.1:4174')).toEqual({
      command: 'xdg-open',
      args: ['http://127.0.0.1:4174'],
    });
  });

  it('未知平台（如 freebsd）：回退 xdg-open，URL 整体作为单个参数', () => {
    const url = 'http://127.0.0.1:4174/?q=a b&x=1';
    const cmd = buildOpenCommand('freebsd', url);
    expect(cmd.command).toBe('xdg-open');
    expect(cmd.args).toEqual([url]);
  });
});

describe('openBrowser：spawn 被 mock，不真开浏览器', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('默认取 process.platform：detached + stdio ignore + unref，并注册 error 监听', () => {
    const child = makeFakeChild();
    mockSpawnReturns(child);
    const url = 'http://127.0.0.1:4174';
    openBrowser(url);

    const expected = buildOpenCommand(process.platform, url);
    expect(spawnMock).toHaveBeenCalledWith(expected.command, expected.args, {
      detached: true,
      stdio: 'ignore',
    });
    expect(child.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(child.unref).toHaveBeenCalledTimes(1);
  });

  it('spawn 同步抛错：静默降级不向外抛出', () => {
    spawnMock.mockImplementation(() => {
      throw new Error('spawn xdg-open ENOENT');
    });
    expect(() => openBrowser('http://127.0.0.1:4174')).not.toThrow();
  });

  it('子进程触发 error 事件：已注册的监听器吞掉错误', () => {
    const child = makeFakeChild();
    mockSpawnReturns(child);
    openBrowser('http://127.0.0.1:4174');

    const errorHandler = child.on.mock.calls.find(([event]) => event === 'error')?.[1] as (
      e: Error
    ) => void;
    expect(errorHandler).toBeTypeOf('function');
    expect(() => errorHandler(new Error('open failed'))).not.toThrow();
  });

  it('注入 spawnFn 与平台：按指定平台构造命令，不触碰默认 spawn', () => {
    const child = makeFakeChild();
    const fakeSpawn = vi.fn(() => child);
    openBrowser(
      'http://example.com',
      'darwin',
      fakeSpawn as unknown as Parameters<typeof openBrowser>[2]
    );

    expect(fakeSpawn).toHaveBeenCalledWith('open', ['http://example.com'], {
      detached: true,
      stdio: 'ignore',
    });
    expect(child.unref).toHaveBeenCalledTimes(1);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});

describe('index.ts 入口：ADMIN_NO_OPEN 开关（重依赖全部 mock）', () => {
  const ORIGINAL = process.env.ADMIN_NO_OPEN;

  beforeEach(() => {
    spawnMock.mockReset();
    mockSpawnReturns(makeFakeChild());
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.ADMIN_NO_OPEN;
    else process.env.ADMIN_NO_OPEN = ORIGINAL;
    vi.restoreAllMocks();
  });

  it('ADMIN_NO_OPEN=1：不调用 spawn（禁用自动打开）', async () => {
    process.env.ADMIN_NO_OPEN = '1';
    vi.resetModules();
    await import('../admin/server/index.ts');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('未设置 ADMIN_NO_OPEN：自动打开编辑器地址 http://127.0.0.1:4174', async () => {
    delete process.env.ADMIN_NO_OPEN;
    vi.resetModules();
    await import('../admin/server/index.ts');

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const expected = buildOpenCommand(process.platform, 'http://127.0.0.1:4174');
    expect(spawnMock).toHaveBeenCalledWith(expected.command, expected.args, {
      detached: true,
      stdio: 'ignore',
    });
  });
});
