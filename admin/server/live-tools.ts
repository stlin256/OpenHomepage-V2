/**
 * 后台「动态数据刷新 + 健康检查」工具入口（spec 20）：
 * - createPrefetchRunner：POST /api/prefetch 的执行器，进程内并发守卫（重复触发 409），
 *   底层调 src/lib/prefetch.ts 的 runPrefetch（force：手动刷新忽略 TTL）；
 * - readPrefetchStatus：GET /api/prefetch/status，从 .cache/meta.json 的 updated_at
 *   （缺失时回退 github.json/rss.json 的 mtime）给出上次抓取时间；
 * - runDoctorCheck：GET /api/doctor，调 scripts/doctor-lib.ts 的 runDoctor 并附汇总计数。
 * 网络/抓取实现均可注入替身，测试零触网。
 */
import path from 'node:path';
import { readFileSync, statSync } from 'node:fs';
import { runPrefetch, type PrefetchResult } from '../../src/lib/prefetch.ts';
import { runDoctor, summarize, type DoctorReport } from '../../scripts/doctor-lib.ts';

/** prefetch 运行中重复触发（HTTP 层经 sendError 映射为 409） */
export class PrefetchBusyError extends Error {}

export interface PrefetchRunArgs {
  dataDir: string;
  cacheDir: string;
  /** 后台手动刷新固定 force=true（忽略 TTL）；测试替身可断言 */
  force: boolean;
}

export type PrefetchRun = (args: PrefetchRunArgs) => Promise<PrefetchResult>;

export interface PrefetchStatus {
  /** 是否有抓取正在进行 */
  running: boolean;
  /** 上次抓取时间（ISO 字符串；从未抓取过为 null） */
  lastFetchedAt: string | null;
}

export interface PrefetchRunner {
  status(): PrefetchStatus;
  run(): Promise<PrefetchResult>;
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** 上次抓取时间：meta.json 的 updated_at 优先（真实抓取时钟），缺失时回退缓存文件 mtime */
export function readPrefetchStatus(cacheDir: string, running = false): PrefetchStatus {
  let at: number | null = null;
  const meta = readJson<{ updated_at?: unknown }>(path.join(cacheDir, 'meta.json'));
  if (typeof meta?.updated_at === 'number') at = meta.updated_at;
  if (at === null) {
    for (const name of ['github.json', 'rss.json']) {
      try {
        const mtime = statSync(path.join(cacheDir, name)).mtimeMs;
        if (at === null || mtime > at) at = mtime;
      } catch {
        /* 缓存文件不存在 */
      }
    }
  }
  return { running, lastFetchedAt: at === null ? null : new Date(at).toISOString() };
}

/** 进程内单实例并发守卫：同一 admin 进程同时只允许一个 prefetch 在跑 */
export function createPrefetchRunner(opts: {
  dataDir: string;
  cacheDir: string;
  /** 抓取实现注入点（测试替身；缺省为真实 runPrefetch） */
  run?: PrefetchRun;
}): PrefetchRunner {
  const runImpl: PrefetchRun = opts.run ?? ((args) => runPrefetch(args));
  let running = false;
  return {
    status: () => readPrefetchStatus(opts.cacheDir, running),
    async run(): Promise<PrefetchResult> {
      if (running) {
        throw new PrefetchBusyError('动态数据刷新进行中，请稍候 / Prefetch already running');
      }
      running = true;
      try {
        // 手动刷新即「现在就抓」：忽略 TTL（runPrefetch 内部仍有 60s 总超时兜底）
        return await runImpl({ dataDir: opts.dataDir, cacheDir: opts.cacheDir, force: true });
      } finally {
        running = false;
      }
    },
  };
}

export interface DoctorCheckResult {
  report: DoctorReport;
  summary: { ok: number; warn: number; error: number; skip: number };
}

export async function runDoctorCheck(rootDir: string, online: boolean): Promise<DoctorCheckResult> {
  const report = await runDoctor({ rootDir, online });
  return { report, summary: summarize(report) };
}
