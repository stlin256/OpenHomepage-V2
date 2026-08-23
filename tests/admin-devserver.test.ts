/**
 * dev server 进程管理（admin/server/devserver.ts）单测：
 * spawn/probe/platform 全注入假替身，不真正拉起 astro。
 */
import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { ChildProcess, spawn } from 'node:child_process';
import {
  buildAstroSpawn,
  parseLocalUrl,
  pushLog,
  probePort,
  createDevServerManager,
  type DevServerDeps,
} from '../admin/server/devserver.ts';

/** 假子进程：stdout/stderr 为事件源；kill/exit 可手动触发 */
class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  pid = 4321;
  exitCode: number | null = null;
  killed = false;
  kill(): boolean {
    this.killed = true;
    this.exit();
    return true;
  }
  exit(code = 0): void {
    if (this.exitCode !== null) return;
    this.exitCode = code;
    queueMicrotask(() => this.emit('exit', code));
  }
}

interface SpawnCall {
  command: string;
  args: string[];
}

/** 假 spawn：记录调用；spawn('taskkill') 时顺带让目标 dev 子进程退出 */
function makeFakeSpawn(dev: FakeChild[], taskkillKills = true) {
  const calls: SpawnCall[] = [];
  const spawnImpl = ((command: string, args: string[]) => {
    calls.push({ command, args });
    if (command === 'taskkill') {
      const tk = new FakeChild();
      queueMicrotask(() => {
        tk.exit(0);
        if (taskkillKills) dev.at(-1)?.exit(0);
      });
      return tk as unknown as ChildProcess;
    }
    const c = new FakeChild();
    dev.push(c);
    return c as unknown as ChildProcess;
  }) as typeof spawn;
  return { calls, spawnImpl };
}

function makeDeps(overrides: Partial<DevServerDeps> = {}) {
  const children: FakeChild[] = [];
  const { calls, spawnImpl } = makeFakeSpawn(children);
  const deps: DevServerDeps = {
    spawn: spawnImpl,
    probe: async () => false,
    platform: 'linux',
    execPath: '/usr/bin/node',
    ...overrides,
  };
  return { deps, children, calls };
}

describe('buildAstroSpawn / parseLocalUrl / pushLog（纯函数）', () => {
  it('spawn 参数：当前 node 直跑 astro CLI + dev --host 127.0.0.1 --port', () => {
    const spec = buildAstroSpawn('/proj', 4321, '/usr/bin/node');
    expect(spec.command).toBe('/usr/bin/node');
    expect(spec.args[0]).toBe(path.join('/proj', 'node_modules', 'astro', 'bin', 'astro.mjs'));
    expect(spec.args.slice(1)).toEqual(['dev', '--host', '127.0.0.1', '--port', '4321']);
    expect(spec.cwd).toBe('/proj');
  });

  it('parseLocalUrl：识别 Astro 的 Local 行（含端口递增），拒绝其他行', () => {
    expect(parseLocalUrl(' ┃ Local    http://localhost:4321/')).toBe('http://localhost:4321/');
    expect(parseLocalUrl('┃ Local    http://127.0.0.1:4322/')).toBe('http://127.0.0.1:4322/');
    expect(parseLocalUrl('┃ Network  http://192.168.1.2:4321/')).toBeNull();
    expect(parseLocalUrl('astro v7 ready in 100 ms')).toBeNull();
    expect(parseLocalUrl('')).toBeNull();
  });

  it('pushLog：忽略空行，超出上限丢最旧行', () => {
    const tail: string[] = [];
    pushLog(tail, '');
    for (let i = 0; i < 5; i++) pushLog(tail, `line${i}`, 3);
    expect(tail).toEqual(['line2', 'line3', 'line4']);
  });
});

describe('probePort（双栈）', () => {
  it('服务只绑 IPv6 ::1 时也能探到（外部 astro dev 的默认绑定）', async () => {
    const server = http.createServer((_req, res) => res.end('ok'));
    // 环境不支持 IPv6 时跳过
    const ok = await new Promise<boolean>((resolve) => {
      server.once('error', () => resolve(false));
      server.listen(0, '::1', () => resolve(true));
    });
    if (!ok) return;
    try {
      const port = (server.address() as AddressInfo).port;
      expect(await probePort(port)).toBe(true);
    } finally {
      await new Promise((r) => server.close(r));
    }
    expect(await probePort(1)).toBe(false);
  });
});

describe('createDevServerManager', () => {
  it('start：spawn astro dev，解析到 Local URL 后上报 url', async () => {
    const { deps, children, calls } = makeDeps();
    const m = createDevServerManager({ rootDir: '/proj', deps });
    let s = await m.start();
    expect(calls.length).toBe(1);
    expect(calls[0].command).toBe('/usr/bin/node');
    expect(s.managed).toBe(true);
    expect(s.up).toBe(false);
    expect(s.starting).toBe(true);

    children[0].stdout.emit('data', Buffer.from('astro v7 ready\n ┃ Local    http://localhost:4321/\n'));
    s = await m.status();
    expect(s.url).toBe('http://localhost:4321/');
    expect(s.logTail.join('\n')).toContain('Local');
  });

  it('start 幂等：已 spawn 时不重复拉起', async () => {
    const { deps, calls } = makeDeps();
    const m = createDevServerManager({ rootDir: '/proj', deps });
    await m.start();
    await m.start();
    expect(calls.length).toBe(1);
  });

  it('外部已有 dev server（probe 通）时不 spawn，managed=false', async () => {
    const { deps, calls } = makeDeps({ probe: async () => true });
    const m = createDevServerManager({ rootDir: '/proj', deps });
    const s = await m.start();
    expect(calls.length).toBe(0);
    expect(s.up).toBe(true);
    expect(s.managed).toBe(false);
  });

  it('端口可访问即 up（不论是不是自己 spawn 的）', async () => {
    let alive = false;
    const { deps } = makeDeps({ probe: async () => alive });
    const m = createDevServerManager({ rootDir: '/proj', deps });
    await m.start();
    alive = true;
    const s = await m.status();
    expect(s.up).toBe(true);
    expect(s.starting).toBe(false);
  });

  it('Windows stop：taskkill /pid /T /F 树杀，之后 managed=false', async () => {
    const { deps, calls } = makeDeps({ platform: 'win32' });
    const m = createDevServerManager({ rootDir: 'C:\\proj', deps });
    await m.start();
    const s = await m.stop();
    const tk = calls.find((c) => c.command === 'taskkill');
    expect(tk).toBeTruthy();
    expect(tk!.args).toEqual(['/pid', '4321', '/T', '/F']);
    expect(s.managed).toBe(false);
  });

  it('POSIX stop：进程组 kill 失败时退化 child.kill', async () => {
    const { deps, children } = makeDeps({ platform: 'linux' });
    const m = createDevServerManager({ rootDir: '/proj', deps });
    await m.start();
    const s = await m.stop();
    expect(children[0].killed).toBe(true);
    expect(s.managed).toBe(false);
  });

  it('stop 不杀外部 dev server（未 spawn 时为空操作）', async () => {
    const { deps, calls } = makeDeps({ probe: async () => true });
    const m = createDevServerManager({ rootDir: '/proj', deps });
    const s = await m.stop();
    expect(calls.length).toBe(0);
    expect(s.up).toBe(true);
  });

  it('astro 异常退出：上报 error，状态复位可重新 start', async () => {
    const { deps, children, calls } = makeDeps();
    const m = createDevServerManager({ rootDir: '/proj', deps });
    await m.start();
    children[0].exit(1);
    await new Promise((r) => setTimeout(r, 10));
    const s = await m.status();
    expect(s.managed).toBe(false);
    expect(s.error).toContain('异常退出');
    await m.start();
    expect(calls.filter((c) => c.command !== 'taskkill').length).toBe(2);
  });
});
