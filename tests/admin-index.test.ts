/**
 * admin CLI 入口（admin/server/index.ts）单测：
 * 进程内动态 import 真实入口模块（每次 vi.resetModules() 重新执行顶层副作用），
 * esbuild / setup / devserver / build / preview / open-browser 全部 mock
 * （不真打包、不 spawn astro dev、不开浏览器、不触碰仓库 data/），
 * 真实 createAdminServer 监听随机空闲端口，探测 GET 200 后手动触发入口注册的
 * SIGINT/SIGTERM 处理器验证清理链路（各 manager stop → server.close → process.exit）。
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';

type SignalHandler = () => void;

interface DevStatusFake {
  up: boolean;
  url: string | null;
  error: string | null;
}

interface BootOptions {
  /** ensureDataDir 是否返回 initialized=true（模拟本次启动自动初始化 data/） */
  initialized: boolean;
  /** 是否设置 ADMIN_NO_OPEN=1（禁用自动打开浏览器） */
  noOpen: boolean;
  /** 假 dev server 管理器返回的状态（覆盖 up/url/error 三个分支字段） */
  devStatus: DevStatusFake;
}

interface BootContext {
  port: number;
  dataDir: string;
  /** 入口注册的 SIGINT/SIGTERM 处理器（从 process 监听器差集提取，直接调用避免惊扰 vitest） */
  sigint: SignalHandler;
  sigterm: SignalHandler;
  exitSpy: ReturnType<typeof vi.fn>;
  mocks: {
    ensureDataDir: ReturnType<typeof vi.fn>;
    openBrowser: ReturnType<typeof vi.fn>;
    devManager: { start: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };
    buildStop: ReturnType<typeof vi.fn>;
    previewStop: ReturnType<typeof vi.fn>;
  };
  logs: () => string;
  warns: () => string;
}

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 本次运行创建的临时目录与已启动实例，afterEach 统一清理 */
const tmpDirs: string[] = [];
const activeBoots: BootContext[] = [];
let origAdminPort: string | undefined;
let origAdminNoOpen: string | undefined;

/** 取一个随机空闲端口（先绑 0 再释放，供入口 ADMIN_PORT 使用） */
async function getFreePort(): Promise<number> {
  const srv = http.createServer();
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const port = (srv.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) =>
    srv.close((err) => (err ? reject(err) : resolve()))
  );
  return port;
}

/** 简单 GET（Connection: close，避免 keep-alive 句柄拖住 vitest 退出） */
function httpGet(
  port: number,
  pathname: string
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: pathname, method: 'GET', headers: { connection: 'close' } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8'), headers: res.headers })
        );
      }
    );
    req.on('error', reject);
    req.end();
  });
}

/** 轮询等待条件成立（真实短定时器，避免 fake timers 与真实 HTTP 混用） */
async function waitFor(cond: () => boolean, timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor 超时：条件未达成');
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** 等待 admin 服务可响应 GET /api/info（listen 回调已触发） */
async function waitForServerUp(port: number): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const r = await httpGet(port, '/api/info');
      if (r.status === 200) return;
    } catch {
      /* 尚未就绪 */
    }
    if (Date.now() - start > 15000) throw new Error('等待 admin 服务就绪超时');
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** 等待端口拒绝连接（server.close 生效，无句柄泄漏） */
async function waitForServerDown(port: number): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      await httpGet(port, '/api/info');
    } catch {
      return; // 连接被拒 = 已关闭
    }
    if (Date.now() - start > 10000) throw new Error('等待 admin 服务关闭超时');
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** mock 全部重型依赖后动态 import 入口模块，返回可操作句柄 */
async function boot(opts: BootOptions): Promise<BootContext> {
  vi.resetModules();
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'admin-index-test-'));
  tmpDirs.push(dataDir);
  const port = await getFreePort();
  process.env.ADMIN_PORT = String(port);
  if (opts.noOpen) process.env.ADMIN_NO_OPEN = '1';
  else delete process.env.ADMIN_NO_OPEN;

  // esbuild：两次 build 分别返回可辨识的 SPA / overlay 产物文本
  const build = vi
    .fn()
    .mockImplementationOnce(async () => ({ outputFiles: [{ text: '// APP_JS' }] }))
    .mockImplementationOnce(async () => ({ outputFiles: [{ text: '// OVERLAY_JS' }] }));
  vi.doMock('esbuild', () => ({ build }));

  // ensureDataDir：指向临时目录，绝不触碰仓库 data/
  const ensureDataDir = vi.fn(() => ({ dataDir, initialized: opts.initialized }));
  vi.doMock('../admin/server/setup.ts', () => ({ ensureDataDir }));

  // dev server 管理器：不 spawn astro；status 按 devStatus 覆盖分支
  const devStatus = { managed: true, starting: false, logTail: [] as string[], ...opts.devStatus };
  const devManager = {
    start: vi.fn(async () => devStatus),
    status: vi.fn(async () => devStatus),
    stop: vi.fn(async () => devStatus),
  };
  vi.doMock('../admin/server/devserver.ts', () => ({
    createDevServerManager: vi.fn(() => devManager),
  }));

  // 构建/预览管理器：仅需 stop 可被 shutdown 链路调用（BuildConflictError 供 http.ts instanceof）
  const buildStop = vi.fn(async () => ({}));
  class BuildConflictError extends Error {}
  vi.doMock('../admin/server/build.ts', () => ({
    createBuildManager: vi.fn(() => ({ status: vi.fn(), start: vi.fn(), stop: buildStop })),
    BuildConflictError,
  }));
  const previewStop = vi.fn(async () => ({}));
  vi.doMock('../admin/server/preview.ts', () => ({
    createPreviewManager: vi.fn(() => ({
      status: vi.fn(async () => ({})),
      start: vi.fn(async () => ({})),
      stop: previewStop,
    })),
  }));

  const openBrowser = vi.fn();
  vi.doMock('../admin/server/open-browser.ts', () => ({ openBrowser }));

  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  // 入口 shutdown 会 process.exit(0)：stub 掉避免杀死测试进程
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

  const sigintBefore = process.listeners('SIGINT');
  const sigtermBefore = process.listeners('SIGTERM');
  await import('../admin/server/index.ts');
  const sigintAdded = process
    .listeners('SIGINT')
    .filter((l) => !sigintBefore.includes(l)) as SignalHandler[];
  const sigtermAdded = process
    .listeners('SIGTERM')
    .filter((l) => !sigtermBefore.includes(l)) as SignalHandler[];
  expect(sigintAdded.length).toBe(1);
  expect(sigtermAdded.length).toBe(1);

  const ctx: BootContext = {
    port,
    dataDir,
    sigint: sigintAdded[0],
    sigterm: sigtermAdded[0],
    exitSpy,
    mocks: { ensureDataDir, openBrowser, devManager, buildStop, previewStop },
    logs: () => logSpy.mock.calls.map((c) => String(c[0])).join('\n'),
    warns: () => warnSpy.mock.calls.map((c) => String(c[0])).join('\n'),
  };
  activeBoots.push(ctx);
  await waitForServerUp(port);
  return ctx;
}

/** 触发入口注册的关闭处理器，等待完整清理链路完成（exit 被调用 + 端口关闭） */
async function shutdown(ctx: BootContext, signal: 'sigint' | 'sigterm'): Promise<void> {
  ctx[signal]();
  await waitFor(() => ctx.exitSpy.mock.calls.length > 0);
  await waitForServerDown(ctx.port);
}

beforeEach(() => {
  origAdminPort = process.env.ADMIN_PORT;
  origAdminNoOpen = process.env.ADMIN_NO_OPEN;
});

afterEach(async () => {
  // 兜底清理：测试中途失败时也要触发 shutdown，确保 server 关闭、不留监听句柄
  for (const ctx of activeBoots.splice(0)) {
    try {
      if (ctx.exitSpy.mock.calls.length === 0) {
        ctx.sigint(); // shuttingDown 幂等：已关闭时为空操作
        await waitFor(() => ctx.exitSpy.mock.calls.length > 0, 5000);
        await waitForServerDown(ctx.port);
      }
    } catch {
      /* 清理失败不掩盖测试结果 */
    }
    process.removeListener('SIGINT', ctx.sigint);
    process.removeListener('SIGTERM', ctx.sigterm);
  }
  vi.restoreAllMocks();
  if (origAdminPort === undefined) delete process.env.ADMIN_PORT;
  else process.env.ADMIN_PORT = origAdminPort;
  if (origAdminNoOpen === undefined) delete process.env.ADMIN_NO_OPEN;
  else process.env.ADMIN_NO_OPEN = origAdminNoOpen;
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('admin/server/index.ts（CLI 入口）', () => {
  it(
    '正常启动：ensureDataDir 用项目根、HTTP 端点 200、esbuild 产物注入 /app.js 与 /overlay.js',
    async () => {
      const ctx = await boot({
        initialized: false,
        noOpen: true,
        devStatus: { up: true, url: 'http://127.0.0.1:4321/', error: null },
      });

      // ensureDataDir 收到的是项目根目录（index.ts 以自身位置推导），且未做初始化
      expect(ctx.mocks.ensureDataDir).toHaveBeenCalledTimes(1);
      expect(ctx.mocks.ensureDataDir).toHaveBeenCalledWith(PROJECT_ROOT);

      // SPA 入口页
      const home = await httpGet(ctx.port, '/');
      expect(home.status).toBe(200);
      expect(String(home.headers['content-type'])).toContain('text/html');

      // esbuild 两次打包产物分别由 /app.js 与 /overlay.js 原样吐出
      const appJs = await httpGet(ctx.port, '/app.js');
      expect(appJs.status).toBe(200);
      expect(appJs.body).toBe('// APP_JS');
      const overlayJs = await httpGet(ctx.port, '/overlay.js');
      expect(overlayJs.status).toBe(200);
      expect(overlayJs.body).toBe('// OVERLAY_JS');

      // /api/info 反映 ensureDataDir 结果（dataDir 只回传 basename）
      const info = await httpGet(ctx.port, '/api/info');
      expect(info.status).toBe(200);
      expect(JSON.parse(info.body)).toEqual({
        initialized: false,
        dataDir: path.basename(ctx.dataDir),
      });

      await shutdown(ctx, 'sigint');
    },
    30000
  );

  it(
    'ADMIN_NO_OPEN=1 时不打开浏览器；启动日志打印监听地址；dev 就绪后打印预览 URL',
    async () => {
      const ctx = await boot({
        initialized: false,
        noOpen: true,
        devStatus: { up: true, url: 'http://127.0.0.1:4321/', error: null },
      });

      // listen 回调打印双语启动信息（含实际端口）
      expect(ctx.logs()).toContain(`http://127.0.0.1:${ctx.port}`);
      expect(ctx.logs()).toContain('Listening on loopback only');
      // ADMIN_NO_OPEN=1 → 不调 openBrowser
      expect(ctx.mocks.openBrowser).not.toHaveBeenCalled();
      // dev server 一键全启动：start 被调一次，status 轮询到 up+url 后打印就绪日志
      await waitFor(() => ctx.logs().includes('Preview ready'));
      expect(ctx.mocks.devManager.start).toHaveBeenCalledTimes(1);
      expect(ctx.logs()).toContain('http://127.0.0.1:4321/');

      await shutdown(ctx, 'sigint');
    },
    30000
  );

  it(
    'SIGINT 触发完整清理：dev/build/preview 全 stop、server 关闭、process.exit(0)，重复触发为空操作',
    async () => {
      const ctx = await boot({
        initialized: false,
        noOpen: true,
        devStatus: { up: true, url: 'http://127.0.0.1:4321/', error: null },
      });

      ctx.sigint();
      await waitFor(() => ctx.exitSpy.mock.calls.length > 0);
      // shutdown 链路：三个管理器各 stop 一次，随后 exit(0)
      expect(ctx.mocks.devManager.stop).toHaveBeenCalledTimes(1);
      expect(ctx.mocks.buildStop).toHaveBeenCalledTimes(1);
      expect(ctx.mocks.previewStop).toHaveBeenCalledTimes(1);
      expect(ctx.exitSpy).toHaveBeenCalledWith(0);
      // server 已关闭（端口拒绝连接，无句柄残留）
      await waitForServerDown(ctx.port);

      // shuttingDown 守卫：重复信号为空操作
      ctx.sigint();
      await new Promise((r) => setTimeout(r, 50));
      expect(ctx.exitSpy).toHaveBeenCalledTimes(1);
      expect(ctx.mocks.devManager.stop).toHaveBeenCalledTimes(1);
    },
    30000
  );

  it(
    'initialized=true 打印初始化提示并反映到 /api/info；未设 ADMIN_NO_OPEN 时自动打开浏览器',
    async () => {
      const ctx = await boot({
        initialized: true,
        noOpen: false,
        devStatus: { up: true, url: 'http://127.0.0.1:4321/', error: null },
      });

      // 首次初始化提示（data.example/ → data/）
      expect(ctx.logs()).toContain('已从 data.example/ 初始化 data/');
      const info = await httpGet(ctx.port, '/api/info');
      expect(JSON.parse(info.body).initialized).toBe(true);
      // 未禁用 → listen 回调内调 openBrowser(adminOrigin)
      expect(ctx.mocks.openBrowser).toHaveBeenCalledTimes(1);
      expect(ctx.mocks.openBrowser).toHaveBeenCalledWith(`http://127.0.0.1:${ctx.port}`);

      await shutdown(ctx, 'sigterm');
    },
    30000
  );

  it(
    'dev server 启动失败分支：打印 warn 且不致命；SIGTERM 同样触发清理',
    async () => {
      const ctx = await boot({
        initialized: false,
        noOpen: true,
        devStatus: { up: false, url: null, error: 'spawn astro 失败' },
      });

      // status 报 error → console.warn 预览失败提示后返回，不影响 admin 服务
      await waitFor(() => ctx.warns().includes('Preview failed'));
      expect(ctx.warns()).toContain('spawn astro 失败');
      const home = await httpGet(ctx.port, '/');
      expect(home.status).toBe(200);

      // SIGTERM 走同一 shutdown 链路
      await shutdown(ctx, 'sigterm');
      expect(ctx.mocks.devManager.stop).toHaveBeenCalledTimes(1);
      expect(ctx.exitSpy).toHaveBeenCalledWith(0);
    },
    30000
  );
});
