/**
 * 撤销/重做（admin/server/history.ts，快照兜底）单测：
 * undo/redo 与快照时间线的对应（undo=恢复上一次写盘前快照，当前状态存为 redo 点）、
 * 多次 undo 链、交错写盘使 redo 失效、无快照不报错、restore 不产生冗余快照、
 * 路径校验、省略 path 走最近写盘文件、撤销删除重建文件。
 * 游标为进程内存（按 dataDir 隔离），每个用例用独立临时目录互不影响。
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { historyState, undo, redo, notifyWrite } from '../admin/server/history.ts';
import { createSnapshot, listSnapshots } from '../admin/server/snapshots.ts';

function withTempData(fn: (dir: string) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'oh-admin-hist-'));
  try {
    mkdirSync(path.join(dir, 'pages/zh'), { recursive: true });
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const REL = 'pages/zh/index.md';

const read = (dir: string, rel = REL) => readFileSync(path.join(dir, rel), 'utf8');
const snapCount = (dir: string, rel = REL) => listSnapshots(dir, rel).length;

/** 模拟一次正常写盘（与 writePage/applyBlockOp/writeConfig 同序：先快照、落盘、再通知） */
function write(dir: string, rel: string, content: string): void {
  createSnapshot(dir, rel);
  writeFileSync(path.join(dir, rel), content);
  notifyWrite(dir, rel);
}

describe('historyState：可用性查询', () => {
  it('无快照时 canUndo=false 而不是报错', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, REL), 'v1');
      expect(historyState(dir, REL)).toEqual({ path: REL, canUndo: false, canRedo: false });
    });
  });

  it('写盘后 canUndo=true；undo 后 canRedo=true', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, REL), 'v0');
      write(dir, REL, 'v1');
      expect(historyState(dir, REL)).toMatchObject({ canUndo: true, canRedo: false });
      undo(dir, REL);
      expect(historyState(dir, REL)).toMatchObject({ canUndo: false, canRedo: true });
    });
  });

  it('路径校验：越权与非快照路径抛 PathError', () => {
    withTempData((dir) => {
      expect(() => historyState(dir, '../outside.md')).toThrowError(/路径非法/);
      expect(() => historyState(dir, 'assets/a.png')).toThrowError(/路径非法/);
      expect(() => undo(dir, 'assets/a.png')).toThrowError(/路径非法/);
    });
  });
});

describe('undo / redo', () => {
  it('undo 回滚到上一次写盘前状态；redo 恢复被撤销的状态', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, REL), 'v0');
      write(dir, REL, 'v1');
      write(dir, REL, 'v2');
      const u = undo(dir, REL);
      expect(u).toMatchObject({ ok: true, path: REL, canUndo: true, canRedo: true });
      expect(read(dir)).toBe('v1');
      const r = redo(dir, REL);
      expect(r).toMatchObject({ ok: true, canRedo: false });
      expect(read(dir)).toBe('v2');
    });
  });

  it('多次 undo 链逐步回退到底后 ok:false（文件不再改动）', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, REL), 'v0');
      write(dir, REL, 'v1');
      write(dir, REL, 'v2');
      expect(undo(dir, REL).ok).toBe(true);
      expect(read(dir)).toBe('v1');
      expect(undo(dir, REL).ok).toBe(true);
      expect(read(dir)).toBe('v0');
      // 到底：canUndo=false，undo 返回 ok:false 且不报错
      const u3 = undo(dir, REL);
      expect(u3).toMatchObject({ ok: false, canUndo: false, canRedo: true });
      expect(read(dir)).toBe('v0');
      // redo 链可一路走回最新
      expect(redo(dir, REL).ok).toBe(true);
      expect(read(dir)).toBe('v1');
      expect(redo(dir, REL).ok).toBe(true);
      expect(read(dir)).toBe('v2');
      expect(redo(dir, REL).ok).toBe(false);
      expect(read(dir)).toBe('v2');
    });
  });

  it('交错写盘使 redo 栈作废（undo 后新写盘 → canRedo=false）', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, REL), 'v0');
      write(dir, REL, 'v1');
      write(dir, REL, 'v2');
      undo(dir, REL); // → v1，redo 点 = v2
      expect(historyState(dir, REL).canRedo).toBe(true);
      write(dir, REL, 'v3'); // 新写盘：redo 栈作废
      expect(historyState(dir, REL)).toMatchObject({ canUndo: true, canRedo: false });
      expect(redo(dir, REL).ok).toBe(false);
      expect(read(dir)).toBe('v3');
      // undo 仍可用：回滚到 v3 写盘前的状态（v1）
      expect(undo(dir, REL).ok).toBe(true);
      expect(read(dir)).toBe('v1');
    });
  });

  it('undo 只新增一个快照（redo 点），恢复自身不产生冗余快照', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, REL), 'v0');
      write(dir, REL, 'v1');
      expect(snapCount(dir)).toBe(1); // 写盘产生的 v0 快照
      undo(dir, REL);
      expect(snapCount(dir)).toBe(2); // 仅 redo 点（v1），恢复 v0 不再备份
      expect(read(dir)).toBe('v0');
      redo(dir, REL);
      expect(snapCount(dir)).toBe(3); // 仅 undo 点（v0），恢复 v1 不再备份
      expect(read(dir)).toBe('v1');
    });
  });

  it('快照被清理（配额/外部删除）后 canUndo=false 而不是报错', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, REL), 'v0');
      write(dir, REL, 'v1');
      const snapDir = path.join(dir, '.snapshots', REL);
      for (const name of readdirSync(snapDir)) rmSync(path.join(snapDir, name));
      expect(historyState(dir, REL)).toMatchObject({ canUndo: false });
      expect(undo(dir, REL).ok).toBe(false);
      expect(read(dir)).toBe('v1');
    });
  });

  it('省略 path 时操作本进程最近写盘文件', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, REL), 'v0');
      write(dir, REL, 'v1');
      expect(historyState(dir)).toMatchObject({ path: REL, canUndo: true });
      expect(undo(dir).ok).toBe(true);
      expect(read(dir)).toBe('v0');
      expect(redo(dir).ok).toBe(true);
      expect(read(dir)).toBe('v1');
    });
  });

  it('撤销删除：文件不存在时 undo 重建文件（无 redo 点）', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, REL), 'v0');
      // 模拟 deletePage：先快照、删除、再通知
      createSnapshot(dir, REL);
      rmSync(path.join(dir, REL));
      notifyWrite(dir, REL);
      expect(existsSync(path.join(dir, REL))).toBe(false);
      const u = undo(dir, REL);
      expect(u).toMatchObject({ ok: true, canRedo: false });
      expect(read(dir)).toBe('v0');
    });
  });
});
