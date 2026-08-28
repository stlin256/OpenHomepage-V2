/**
 * 撤销/重做（快照兜底）：以文件为粒度，把文件回滚到上一次写盘前的状态。
 *
 * 与快照时间线（admin/server/snapshots.ts）的对应：
 * - 正常写盘（pages/blocks/configs）写前 createSnapshot —— 磁盘时间线
 *   （listSnapshots，新→旧）即"文件持有过的状态"的倒序列表，[0] = 上一次写盘前的状态；
 * - undo：先把当前状态 createSnapshot 存为新快照（redo 点），再把 undo 链链首快照
 *   直接 copyFileSync 回文件——不走 restoreSnapshot：它内部会先把当前状态自动入快照，
 *   与本模块自管的 redo 点叠加会把同一状态备两份、时间线错乱；
 * - redo：恢复 future 栈栈顶快照；恢复前同样把当前状态入快照压回 undo 链
 *   （与 undo 的 redo 点对称，保证 undo/redo 可来回走）；
 * - 该文件发生任何新的正常写盘（notifyWrite）→ redo 栈作废、undo 链按磁盘时间线重建
 *   （与常见编辑器"新修改后不可 redo"的语义一致）。
 *
 * 游标仅存进程内存：admin 重启后 undo/redo 链清零，首次访问按磁盘时间线播种
 * （重启前 undo/redo 留下的快照可能被当作过去状态走过——可接受的近似）。
 * undo/redo 制造的快照同样占每文件 MAX_SNAPSHOTS(20) 名额，旧版会被挤掉；
 * 访问时按 ts 校验快照仍在盘上，被挤掉的游标项自动丢弃（不报错，canUndo/canRedo=false）。
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { safeResolve } from './paths.ts';
import { createSnapshot, listSnapshots } from './snapshots.ts';

/** 单文件游标：ts 均按新→旧排列（[0] 为下一个目标） */
interface FileHistory {
  /** undo 链：[0] = 下一个撤销目标（上一次写盘前的状态快照） */
  past: string[];
  /** redo 栈：[0] = 下一个重做目标（undo 撤销前的状态快照） */
  future: string[];
}

/** 进程内存游标：dataDir → (rel → 游标)（admin 重启即清零，见模块注释） */
const histories = new Map<string, Map<string, FileHistory>>();
/** 各 dataDir 最近一次写盘/撤销/重做的文件（接口省略 path 时的操作目标） */
const lastTouched = new Map<string, string>();

/** 从磁盘时间线播种游标（future 清空——播种语义即"新写盘后 redo 失效"） */
function seed(dataDir: string, rel: string): FileHistory {
  const h: FileHistory = { past: listSnapshots(dataDir, rel).map((s) => s.ts), future: [] };
  let byRel = histories.get(dataDir);
  if (!byRel) histories.set(dataDir, (byRel = new Map()));
  byRel.set(rel, h);
  return h;
}

function entryOf(dataDir: string, rel: string): FileHistory {
  return histories.get(dataDir)?.get(rel) ?? seed(dataDir, rel);
}

/** 正常写盘通知（pages/blocks/configs 落盘后调用）：undo 链按磁盘重建、redo 栈作废 */
export function notifyWrite(dataDir: string, rel: string): void {
  seed(dataDir, rel);
  lastTouched.set(dataDir, rel);
}

/** 丢弃已被配额清理/外部删除的快照 ts；返回是否还有剩余 */
function dropMissing(dataDir: string, rel: string, list: string[]): boolean {
  const existing = new Set(listSnapshots(dataDir, rel).map((s) => s.ts));
  for (let i = list.length - 1; i >= 0; i--) {
    if (!existing.has(list[i])) list.splice(i, 1);
  }
  return list.length > 0;
}

/** 操作目标：显式 path 优先；缺省取本进程最近写盘文件（overlay 顶栏撤销的全局语义） */
function resolveRel(dataDir: string, rel?: string): string | null {
  return rel ? rel : (lastTouched.get(dataDir) ?? null);
}

export interface HistoryState {
  /** 当前目标文件（null = 本进程尚无写盘记录） */
  path: string | null;
  canUndo: boolean;
  canRedo: boolean;
}

/** GET /api/history：撤销/重做可用性；无快照不报错（canUndo=false） */
export function historyState(dataDir: string, rel?: string): HistoryState {
  const r = resolveRel(dataDir, rel);
  if (!r) return { path: null, canUndo: false, canRedo: false };
  safeResolve(dataDir, r); // 路径校验（PathError → http 层 400）
  const h = entryOf(dataDir, r);
  return {
    path: r,
    canUndo: dropMissing(dataDir, r, h.past),
    canRedo: dropMissing(dataDir, r, h.future),
  };
}

export interface HistoryOpResult extends HistoryState {
  /** false = 无可撤销/重做（按钮置灰后的并发兜底），文件未改动 */
  ok: boolean;
}

/** 把快照 target 覆盖回文件（恢复本身不再触发写前快照，见模块注释） */
function restoreVerbatim(dataDir: string, rel: string, dest: string, target: string): void {
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(path.join(dataDir, '.snapshots', ...rel.split('/'), target), dest);
}

/** POST /api/history/undo：当前状态存为 redo 点，恢复上一次写盘前的快照 */
export function undo(dataDir: string, rel?: string): HistoryOpResult {
  const r = resolveRel(dataDir, rel);
  if (!r) return { path: null, canUndo: false, canRedo: false, ok: false };
  const dest = safeResolve(dataDir, r);
  const h = entryOf(dataDir, r);
  const target = dropMissing(dataDir, r, h.past) ? h.past.shift()! : undefined;
  if (!target) {
    return { path: r, canUndo: false, canRedo: dropMissing(dataDir, r, h.future), ok: false };
  }
  // redo 点：当前状态入快照（文件已被删除时无 redo 点——撤销删除即重建文件）
  const redoPoint = createSnapshot(dataDir, r);
  restoreVerbatim(dataDir, r, dest, target);
  if (redoPoint) h.future.unshift(path.basename(redoPoint));
  lastTouched.set(dataDir, r);
  return { path: r, canUndo: h.past.length > 0, canRedo: h.future.length > 0, ok: true };
}

/** POST /api/history/redo：恢复 redo 栈栈顶快照，当前状态入快照压回 undo 链 */
export function redo(dataDir: string, rel?: string): HistoryOpResult {
  const r = resolveRel(dataDir, rel);
  if (!r) return { path: null, canUndo: false, canRedo: false, ok: false };
  const dest = safeResolve(dataDir, r);
  const h = entryOf(dataDir, r);
  const target = dropMissing(dataDir, r, h.future) ? h.future.shift()! : undefined;
  if (!target) {
    return { path: r, canUndo: dropMissing(dataDir, r, h.past), canRedo: false, ok: false };
  }
  // 对称于 undo 的 redo 点：当前（已撤销的）状态入快照，保证随后还能再 undo
  const undoPoint = createSnapshot(dataDir, r);
  if (undoPoint) h.past.unshift(path.basename(undoPoint));
  restoreVerbatim(dataDir, r, dest, target);
  lastTouched.set(dataDir, r);
  return { path: r, canUndo: h.past.length > 0, canRedo: h.future.length > 0, ok: true };
}
