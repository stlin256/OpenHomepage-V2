/**
 * dist/ 静态预览管理（发布视图，spec 21 §3）：
 * - 直接复用 scripts/serve.ts 的 createStaticServer（serve-lib 的路径解析/MIME/缓存策略），
 *   进程内起 HTTP 服务（admin 退出时随 shutdown close，无子进程残留）；
 * - 幂等 start/stop；端口被外部服务占用时探测接管上报（不强杀外部服务，同 devserver 语义）；
 * - 仅监听 127.0.0.1，默认端口 4399（避开 admin 4174 / astro dev 4321 / serve 8080）；
 * - probe/createServer 可注入，测试用假替身。
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createStaticServer } from '../../scripts/serve.ts';
import { probePortHost, loopbackUrl } from './devserver.ts';

export const PREVIEW_PORT = 4399;

export interface PreviewStatus {
  /** 端口可访问（无论是不是本管理器启动的） */
  up: boolean;
  /** 由本管理器启动（外部占用端口接管时为 false，stop 不动它） */
  managed: boolean;
  url: string | null;
  port: number;
  error: string | null;
}

/** createStaticServer 返回值的最小接口（测试注入假替身） */
export interface PreviewServerLike {
  listen(port: number, host: string, cb: () => void): unknown;
  close(cb?: (err?: Error) => void): unknown;
  on(event: 'error', cb: (e: Error) => void): unknown;
}

export interface PreviewDeps {
  /** 探测端口，返回可连通的回环 host，不可达返回 null */
  probe: (port: number) => Promise<string | null>;
  createServer: (distDir: string) => PreviewServerLike;
}

export interface PreviewManager {
  status(): Promise<PreviewStatus>;
  start(): Promise<PreviewStatus>;
  stop(): Promise<PreviewStatus>;
}

export function createPreviewManager(opts: {
  rootDir: string;
  port?: number;
  deps?: Partial<PreviewDeps>;
}): PreviewManager {
  const port = opts.port ?? PREVIEW_PORT;
  const distDir = path.join(opts.rootDir, 'dist');
  const deps: PreviewDeps = {
    probe: probePortHost,
    createServer: (dist) =>
      // 预览固定走 HTTP（自部署 SSL 由 scripts/serve.ts 负责，本地预览不需要证书）
      createStaticServer({ secure: false, port, warnings: [] }, dist) as PreviewServerLike,
    ...opts.deps,
  };

  let server: PreviewServerLike | null = null;
  let error: string | null = null;

  const status = async (): Promise<PreviewStatus> => {
    const host = await deps.probe(port);
    return {
      up: host !== null,
      managed: server !== null,
      url: host ? loopbackUrl(host, port) : null,
      port,
      error,
    };
  };

  const start = async (): Promise<PreviewStatus> => {
    if (server) return status();
    if (await deps.probe(port)) return status(); // 端口已有服务，接管上报不重复启动
    error = null;
    if (!existsSync(distDir)) {
      error = 'dist/ 不存在，请先构建 / dist/ not found; run a build first';
      return status();
    }
    const srv = deps.createServer(distDir);
    server = srv;
    srv.on('error', (e) => {
      error = `预览服务启动失败：${e.message}`;
      if (server === srv) server = null;
    });
    srv.listen(port, '127.0.0.1', () => {
      /* 就绪后由 status() 探测 */
    });
    return status();
  };

  const stop = async (): Promise<PreviewStatus> => {
    const srv = server;
    if (!srv) return status();
    await new Promise<void>((resolve) => {
      srv.close(() => resolve());
      setTimeout(resolve, 3000).unref();
    });
    if (server === srv) server = null;
    return status();
  };

  return { status, start, stop };
}
