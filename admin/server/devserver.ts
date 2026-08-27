/**
 * dev server（astro dev）进程管理：编辑器内一键启动/停止预览服务。
 * - spawn 直接用当前 node 跑 astro CLI（node_modules/astro/bin/astro.mjs），
 *   避开 Windows 下 npx/npm 的 .cmd 壳，便于精确控制进程树；
 * - 从 stdout/stderr 解析 Astro 打印的 Local URL（端口被占自动递增时也能拿到真实端口）；
 * - 停止时 Windows 用 taskkill /T /F 杀整棵进程树，POSIX 杀进程组；
 * - spawn/probe/platform 全部可注入，测试用假命令替身。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';

export interface DevStatus {
  /** 端口可访问（无论是不是本管理器 spawn 的） */
  up: boolean;
  /** 已 spawn 但端口尚未就绪 */
  starting: boolean;
  /** 由本管理器 spawn（外部手动 npm run dev 时为 false，stop 不会动它） */
  managed: boolean;
  /** 从日志解析到的真实 URL（未解析到时为 null） */
  url: string | null;
  logTail: string[];
  error: string | null;
}

export interface SpawnSpec {
  command: string;
  args: string[];
  cwd: string;
  /** 需合并进子进程的环境变量（可视化编辑开关等）；undefined = 原样继承 process.env */
  env?: Record<string, string>;
}

/**
 * spawn 参数（纯函数）：node + astro CLI 直跑，避免 .cmd 壳；--host 固定 IPv4 回环便于探测。
 * 可视化编辑（M12a）：admin 拉起的 dev server 注入 OH_EDIT=1 与 OH_ADMIN_ORIGIN
 * （overlay 静态资源/CORS 的来源）；外部手动 npm run dev 无此环境变量 → 页面零编辑痕迹。
 */
export function buildAstroSpawn(
  rootDir: string,
  port: number,
  execPath: string,
  adminOrigin?: string,
): SpawnSpec {
  return {
    command: execPath,
    args: [
      path.join(rootDir, 'node_modules', 'astro', 'bin', 'astro.mjs'),
      'dev',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    cwd: rootDir,
    env: { OH_EDIT: '1', OH_ADMIN_ORIGIN: adminOrigin ?? 'http://127.0.0.1:4174' },
  };
}

/** 从 Astro 日志行解析本地 URL（"┃ Local    http://localhost:4321/"） */
export function parseLocalUrl(line: string): string | null {
  if (!/local/i.test(line)) return null;
  const m = line.match(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+\/?/);
  return m ? m[0] : null;
}

/**
 * 回环 URL 归一化为 127.0.0.1：Astro 日志可能打印 localhost（我们 spawn 时固定
 * --host 127.0.0.1，实际绑定在 IPv4 回环）；若浏览器把 localhost 解析到 ::1，
 * iframe/新标签页会 ERR_CONNECTION_REFUSED（Windows 双栈常见坑）。
 */
export function normalizeLoopbackUrl(url: string): string {
  return url.replace(/^(https?:\/\/)localhost/, '$1' + '127.0.0.1');
}

/** 回环 host + 端口 → 可用 URL（IPv6 加方括号） */
export function loopbackUrl(host: string, port: number): string {
  return `http://${host.includes(':') ? `[${host}]` : host}:${port}/`;
}

/** 日志尾部环形缓冲（单行追加，超出长度丢最旧行） */
export function pushLog(tail: string[], line: string, maxLines = 200): void {
  if (line.length === 0) return;
  tail.push(line);
  if (tail.length > maxLines) tail.splice(0, tail.length - maxLines);
}

function probeHost(port: number, host: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: '/', timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

/** 探测本机端口上的 http 服务，返回可连通的回环 host；不可达返回 null。
    IPv4/IPv6 回环都试（外部 astro dev 默认可能只绑 ::1） */
export async function probePortHost(port: number, timeoutMs = 800): Promise<string | null> {
  for (const host of ['127.0.0.1', '::1']) {
    if (await probeHost(port, host, timeoutMs)) return host;
  }
  return null;
}

/** 探测本机端口上的 http 服务是否可达（probePortHost 的布尔包装） */
export async function probePort(port: number, timeoutMs = 800): Promise<boolean> {
  return (await probePortHost(port, timeoutMs)) !== null;
}

/** 终止子进程树：Windows 用 taskkill /T /F；POSIX 杀 detached 进程组，退化 child.kill */
export async function killProcessTree(
  child: ChildProcess,
  platform: string,
  spawnImpl: typeof spawn = spawn
): Promise<void> {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (platform === 'win32') {
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      try {
        const tk = spawnImpl('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        tk.on('exit', finish);
        tk.on('error', finish);
      } catch {
        finish();
      }
      setTimeout(finish, 5000).unref();
    });
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      /* 已退出 */
    }
  }
}

export interface DevServerDeps {
  spawn: typeof spawn;
  /** 探测端口，返回可连通的回环 host（'127.0.0.1' / '::1'），不可达返回 null */
  probe: (port: number) => Promise<string | null>;
  platform: string;
  execPath: string;
}

export interface DevServerManager {
  status(): Promise<DevStatus>;
  /** 幂等：已运行（或外部已有 dev server）时直接返回状态 */
  start(): Promise<DevStatus>;
  /** 只杀本管理器 spawn 的进程；外部 dev server 不动 */
  stop(): Promise<DevStatus>;
}

export function createDevServerManager(opts: {
  rootDir: string;
  port?: number;
  /** admin server 的回环 origin（注入 OH_ADMIN_ORIGIN；缺省 http://127.0.0.1:4174） */
  adminOrigin?: string;
  deps?: Partial<DevServerDeps>;
}): DevServerManager {
  const port = opts.port ?? 4321;
  const deps: DevServerDeps = {
    spawn,
    probe: probePortHost,
    platform: process.platform,
    execPath: process.execPath,
    ...opts.deps,
  };

  let child: ChildProcess | null = null;
  let url: string | null = null;
  let error: string | null = null;
  let stopping = false;
  let lineBuf = '';
  const tail: string[] = [];

  const onChunk = (chunk: Buffer) => {
    // 按行切分（chunk 边界可能切断 URL 行，先缓冲半行）
    lineBuf += chunk.toString('utf8');
    const lines = lineBuf.split(/\r?\n/);
    lineBuf = lines.pop() ?? '';
    for (const line of lines) {
      pushLog(tail, line);
      if (!url) {
        const u = parseLocalUrl(line);
        if (u) url = normalizeLoopbackUrl(u);
      }
    }
  };

  const status = async (): Promise<DevStatus> => {
    const ports = [port];
    if (url) {
      const u = Number(new URL(url).port);
      if (u && u !== port) ports.push(u);
    }
    // 探测实际可连通的回环 host 并据此构造 URL：外部 dev server 可能只绑 ::1，
    // iframe 一律写 127.0.0.1 会 ERR_CONNECTION_REFUSED（修正：双栏预览/预览按钮）
    let reachableUrl: string | null = null;
    for (const p of ports) {
      const host = await deps.probe(p);
      if (host) {
        reachableUrl = loopbackUrl(host, p);
        break;
      }
    }
    const up = reachableUrl !== null;
    return {
      up,
      starting: child !== null && !up,
      managed: child !== null,
      url: reachableUrl ?? (url ? normalizeLoopbackUrl(url) : null),
      logTail: [...tail],
      error,
    };
  };

  const start = async (): Promise<DevStatus> => {
    if (child) return status();
    if (await deps.probe(port)) return status(); // 已有（外部）dev server，不重复 spawn
    error = null;
    url = null;
    const spec = buildAstroSpawn(opts.rootDir, port, deps.execPath, opts.adminOrigin);
    let c: ChildProcess;
    try {
      c = deps.spawn(spec.command, spec.args, {
        cwd: spec.cwd,
        env: { ...process.env, ...spec.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: deps.platform !== 'win32', // POSIX 下独立进程组，便于整组终止
        windowsHide: true,
      });
    } catch (e) {
      error = `spawn 失败：${(e as Error).message}`;
      return status();
    }
    child = c;
    c.stdout?.on('data', onChunk);
    c.stderr?.on('data', onChunk);
    c.on('error', (e) => {
      error = `spawn 失败：${e.message}`;
      if (child === c) child = null;
    });
    c.on('exit', (code) => {
      if (child === c) {
        if (!stopping && code !== 0 && code !== null) error = `astro dev 异常退出（code ${code}）`;
        child = null;
      }
    });
    return status();
  };

  const stop = async (): Promise<DevStatus> => {
    const c = child;
    if (!c) return status();
    stopping = true;
    const exited = new Promise<void>((resolve) => {
      c.once('exit', () => resolve());
      setTimeout(resolve, 5000).unref();
    });
    await killProcessTree(c, deps.platform, deps.spawn);
    await exited;
    if (child === c) child = null;
    stopping = false;
    url = null;
    return status();
  };

  return { status, start, stop };
}
