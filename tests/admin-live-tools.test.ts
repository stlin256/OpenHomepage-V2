/**
 * 后台图形化工具入口（spec 20）测试：
 * - buildOpenCommand（admin/server/open-browser.ts）：三平台打开命令构造（纯函数）；
 * - createPrefetchRunner / readPrefetchStatus（admin/server/live-tools.ts）：
 *   并发守卫（PrefetchBusyError）、force 传参、上次抓取时间（meta.json / mtime 回退）；
 * - HTTP 端点：POST /api/prefetch（200 / 409 / 500）、GET /api/prefetch/status、
 *   GET /api/doctor（online 参数解析 / 500）。
 * 网络与抓取实现全部注入替身，零触网。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { buildOpenCommand } from '../admin/server/open-browser.ts';
import {
  createPrefetchRunner,
  readPrefetchStatus,
  PrefetchBusyError,
  type DoctorCheckResult,
  type PrefetchRun,
} from '../admin/server/live-tools.ts';
import { createAdminServer } from '../admin/server/http.ts';
import type { PrefetchResult } from '../src/lib/prefetch.ts';

const OK_RESULT: PrefetchResult = {
  ok: true,
  blocks: [{ key: 'github.user', status: 'fresh', error: null }],
  warnings: [],
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('buildOpenCommand', () => {
  const url = 'http://127.0.0.1:4174';
  it('Windows：cmd /c start（空标题占位）', () => {
    expect(buildOpenCommand('win32', url)).toEqual({
      command: 'cmd',
      args: ['/c', 'start', '""', url],
    });
  });
  it('macOS：open', () => {
    expect(buildOpenCommand('darwin', url)).toEqual({ command: 'open', args: [url] });
  });
  it('Linux 及其他：xdg-open', () => {
    expect(buildOpenCommand('linux', url)).toEqual({ command: 'xdg-open', args: [url] });
    expect(buildOpenCommand('freebsd', url)).toEqual({ command: 'xdg-open', args: [url] });
  });
});

describe('readPrefetchStatus', () => {
  it('meta.json 的 updated_at 优先，输出 ISO 时间', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oh-prefetch-'));
    try {
      const ts = Date.UTC(2026, 8, 5, 12, 0, 0);
      writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ updated_at: ts, ok: true }));
      const s = readPrefetchStatus(dir);
      expect(s.running).toBe(false);
      expect(s.lastFetchedAt).toBe(new Date(ts).toISOString());
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('meta.json 缺失时回退 github.json / rss.json 的较新 mtime', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oh-prefetch-'));
    try {
      const old = new Date(Date.UTC(2026, 0, 1));
      const recent = new Date(Date.UTC(2026, 5, 1));
      writeFileSync(path.join(dir, 'github.json'), '{}');
      writeFileSync(path.join(dir, 'rss.json'), '{}');
      utimesSync(path.join(dir, 'github.json'), old, old);
      utimesSync(path.join(dir, 'rss.json'), recent, recent);
      const s = readPrefetchStatus(dir);
      expect(s.lastFetchedAt).toBe(recent.toISOString());
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('缓存目录不存在 / 无任何缓存文件 → lastFetchedAt 为 null', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oh-prefetch-'));
    try {
      expect(readPrefetchStatus(path.join(dir, 'missing')).lastFetchedAt).toBeNull();
      expect(readPrefetchStatus(dir).lastFetchedAt).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('createPrefetchRunner', () => {
  it('运行中重复触发抛 PrefetchBusyError；结束后恢复可再次运行', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oh-prefetch-'));
    try {
      const d = deferred<PrefetchResult>();
      let calls = 0;
      const runner = createPrefetchRunner({
        dataDir: dir,
        cacheDir: dir,
        run: async (args) => {
          calls++;
          expect(args.force).toBe(true); // 后台手动刷新固定忽略 TTL
          expect(args.dataDir).toBe(dir);
          expect(args.cacheDir).toBe(dir);
          return d.promise;
        },
      });
      expect(runner.status().running).toBe(false);
      const first = runner.run();
      // 让第一次调用进入运行态
      await new Promise((r) => setTimeout(r, 0));
      expect(runner.status().running).toBe(true);
      await expect(runner.run()).rejects.toBeInstanceOf(PrefetchBusyError);
      d.resolve(OK_RESULT);
      expect(await first).toBe(OK_RESULT);
      expect(runner.status().running).toBe(false);
      expect(calls).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('抓取实现抛错时错误透传且运行态复位', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oh-prefetch-'));
    try {
      const runner = createPrefetchRunner({
        dataDir: dir,
        cacheDir: dir,
        run: async () => {
          throw new Error('network boom');
        },
      });
      await expect(runner.run()).rejects.toThrow('network boom');
      expect(runner.status().running).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---- HTTP 端点 ----

describe('HTTP /api/prefetch* 与 /api/doctor', () => {
  let dataDir: string;
  let cacheDir: string;
  let server: Server;
  let base: string;
  let prefetchImpl: PrefetchRun = async () => OK_RESULT;
  let doctorImpl: (online: boolean) => Promise<DoctorCheckResult>;

  const DOCTOR_RESULT: DoctorCheckResult = {
    report: {
      dataDir: null,
      usedExample: false,
      sections: [
        { id: 'env', title: '运行环境', items: [{ severity: 'ok', message: 'Node.js v24' }] },
      ],
    },
    summary: { ok: 1, warn: 0, error: 0, skip: 0 },
  };

  async function api(p: string, init?: RequestInit) {
    const res = await fetch(base + p, init);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }
  const post = (p: string) => api(p, { method: 'POST' });

  beforeAll(async () => {
    doctorImpl = async () => DOCTOR_RESULT;
    dataDir = mkdtempSync(path.join(tmpdir(), 'oh-live-data-'));
    cacheDir = mkdtempSync(path.join(tmpdir(), 'oh-live-cache-'));
    mkdirSync(path.join(dataDir, 'pages', 'zh'), { recursive: true });
    server = createAdminServer({
      dataDir,
      initialized: false,
      appJs: '',
      cacheDir,
      prefetchRun: (args) => prefetchImpl(args),
      doctorRun: (online) => doctorImpl(online),
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it('GET /api/prefetch/status：无缓存时 lastFetchedAt 为 null 且未在运行', async () => {
    prefetchImpl = async () => OK_RESULT;
    const r = await api('/api/prefetch/status');
    expect(r.status).toBe(200);
    expect(r.body.running).toBe(false);
    expect(r.body.lastFetchedAt).toBeNull();
  });

  it('POST /api/prefetch：返回抓取结果；status 反映 meta.json 的上次抓取时间', async () => {
    const r = await post('/api/prefetch');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect((r.body.blocks as { key: string }[])[0].key).toBe('github.user');

    // 模拟抓取写盘（替身不落盘，这里补一个 meta.json 验证 status 读取链路）
    const ts = Date.UTC(2026, 8, 5, 8, 30, 0);
    writeFileSync(path.join(cacheDir, 'meta.json'), JSON.stringify({ updated_at: ts }));
    const s = await api('/api/prefetch/status');
    expect(s.body.lastFetchedAt).toBe(new Date(ts).toISOString());
  });

  it('POST /api/prefetch 并发：第二次触发 → 409；期间 status 显示 running', async () => {
    const d = deferred<PrefetchResult>();
    let entered!: () => void;
    const enteredP = new Promise<void>((r) => (entered = r));
    prefetchImpl = () => {
      entered();
      return d.promise;
    };
    const first = post('/api/prefetch');
    await enteredP;
    const dup = await post('/api/prefetch');
    expect(dup.status).toBe(409);
    expect(String(dup.body.error)).toContain('进行中');
    const s = await api('/api/prefetch/status');
    expect(s.body.running).toBe(true);
    d.resolve(OK_RESULT);
    expect((await first).status).toBe(200);
    prefetchImpl = async () => OK_RESULT;
  });

  it('POST /api/prefetch 抓取抛错 → 500 + 友好错误信息', async () => {
    prefetchImpl = async () => {
      throw new Error('network boom');
    };
    const r = await post('/api/prefetch');
    expect(r.status).toBe(500);
    expect(String(r.body.error)).toContain('network boom');
    prefetchImpl = async () => OK_RESULT;
  });

  it('GET /api/doctor：默认离线；?online=1 透传在线检查', async () => {
    const seen: boolean[] = [];
    doctorImpl = async (online) => {
      seen.push(online);
      return DOCTOR_RESULT;
    };
    const offline = await api('/api/doctor');
    expect(offline.status).toBe(200);
    expect(offline.body.online).toBe(false);
    expect((offline.body.summary as { ok: number }).ok).toBe(1);
    expect(
      (offline.body.report as { sections: { id: string }[] }).sections[0].id
    ).toBe('env');

    const online = await api('/api/doctor?online=1');
    expect(online.status).toBe(200);
    expect(online.body.online).toBe(true);
    expect(seen).toEqual([false, true]);
  });

  it('GET /api/doctor 检查抛错 → 500', async () => {
    doctorImpl = async () => {
      throw new Error('doctor exploded');
    };
    const r = await api('/api/doctor');
    expect(r.status).toBe(500);
    expect(String(r.body.error)).toContain('doctor exploded');
    doctorImpl = async () => DOCTOR_RESULT;
  });
});
