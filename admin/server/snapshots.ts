/**
 * 版本快照：写盘前把旧版本备份到 data/.snapshots/<相对路径>/<timestamp>，
 * 每文件保留最近 MAX_SNAPSHOTS 版（超出清理最旧），支持列表查看与回滚。
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { safeResolve, assertSnapshottable } from './paths.ts';

export const MAX_SNAPSHOTS = 20;

const TS_RE = /^\d{8}T\d{9}$/;

/** yyyyMMddTHHmmssSSS，字典序即时间序 */
export function formatTimestamp(d: Date): string {
  const p = (n: number, w: number) => String(n).padStart(w, '0');
  return (
    `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1, 2)}${p(d.getUTCDate(), 2)}` +
    `T${p(d.getUTCHours(), 2)}${p(d.getUTCMinutes(), 2)}${p(d.getUTCSeconds(), 2)}${p(d.getUTCMilliseconds(), 3)}`
  );
}

function snapshotsDir(dataDir: string, rel: string): string {
  assertSnapshottable(rel);
  return path.join(dataDir, '.snapshots', ...rel.split('/'));
}

function prune(dir: string): void {
  const names = readdirSync(dir).filter((n) => TS_RE.test(n)).sort();
  const excess = names.length - MAX_SNAPSHOTS;
  for (const name of names.slice(0, Math.max(0, excess))) {
    rmSync(path.join(dir, name), { force: true });
  }
}

/**
 * 把 data/ 内 rel 指向的现有文件快照一份；文件不存在时返回 null（不产生快照）。
 * 返回快照文件绝对路径。
 */
export function createSnapshot(dataDir: string, rel: string, now: Date = new Date()): string | null {
  const src = safeResolve(dataDir, rel);
  const dir = snapshotsDir(dataDir, rel);
  if (!existsSync(src)) return null;
  mkdirSync(dir, { recursive: true });
  let ts = formatTimestamp(now);
  // 同一毫秒内多次快照时逐毫秒避让，保持文件名唯一
  let dest = path.join(dir, ts);
  for (let bump = 1; existsSync(dest); bump++) {
    ts = formatTimestamp(new Date(now.getTime() + bump));
    dest = path.join(dir, ts);
  }
  copyFileSync(src, dest);
  prune(dir);
  return dest;
}

/** 快照列表，按时间倒序（最新在前） */
export function listSnapshots(dataDir: string, rel: string): { ts: string }[] {
  const dir = snapshotsDir(dataDir, rel);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => TS_RE.test(n) && statSync(path.join(dir, n)).isFile())
    .sort()
    .reverse()
    .map((ts) => ({ ts }));
}

/** 回滚：先把当前版本入快照（可再次找回），再把目标快照覆盖回去 */
export function restoreSnapshot(dataDir: string, rel: string, ts: string, now: Date = new Date()): void {
  if (!TS_RE.test(ts)) throw new Error(`路径非法：${ts} / Invalid path`);
  const dir = snapshotsDir(dataDir, rel);
  const snap = path.join(dir, ts);
  if (!existsSync(snap)) throw new Error(`快照不存在：${rel}@${ts} / Snapshot not found`);
  const dest = safeResolve(dataDir, rel);
  if (existsSync(dest)) createSnapshot(dataDir, rel, now);
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(snap, dest);
}
