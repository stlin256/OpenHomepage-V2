import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
  formatTimestamp,
  MAX_SNAPSHOTS,
} from '../admin/server/snapshots.ts';

function withTempData(fn: (dir: string) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'oh-admin-snap-'));
  try {
    mkdirSync(path.join(dir, 'pages/zh'), { recursive: true });
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const REL = 'pages/zh/index.md';

describe('formatTimestamp', () => {
  it('输出可字典序排序的时间戳', () => {
    const ts = formatTimestamp(new Date('2026-08-22T16:01:02.345Z'));
    expect(ts).toMatch(/^\d{8}T\d{9}$/);
    const later = formatTimestamp(new Date('2026-08-22T16:01:02.346Z'));
    expect(later > ts).toBe(true);
  });
});

describe('createSnapshot / listSnapshots', () => {
  it('写盘前把旧版本快照到 .snapshots/<相对路径>/<timestamp>', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, REL), 'v1');
      const snap = createSnapshot(dir, REL, new Date('2026-01-01T00:00:00.000Z'));
      expect(snap).toBe(path.join(dir, '.snapshots', REL, '20260101T000000000'));
      expect(readFileSync(snap!, 'utf8')).toBe('v1');
      const list = listSnapshots(dir, REL);
      expect(list).toEqual([{ ts: '20260101T000000000' }]);
    });
  });

  it('目标文件不存在时不产生快照', () => {
    withTempData((dir) => {
      expect(createSnapshot(dir, REL)).toBeNull();
    });
  });

  it('列表按时间倒序，超出 20 版自动清理最旧', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, REL), 'x');
      const base = Date.parse('2026-01-01T00:00:00.000Z');
      for (let i = 0; i < MAX_SNAPSHOTS + 5; i++) {
        createSnapshot(dir, REL, new Date(base + i * 1000));
      }
      const list = listSnapshots(dir, REL);
      expect(list).toHaveLength(MAX_SNAPSHOTS);
      expect(list[0].ts).toBe(formatTimestamp(new Date(base + (MAX_SNAPSHOTS + 4) * 1000)));
      expect(list.at(-1)!.ts).toBe(formatTimestamp(new Date(base + 5 * 1000)));
      // 磁盘上同样只剩 20 个
      expect(readdirSync(path.join(dir, '.snapshots', REL))).toHaveLength(MAX_SNAPSHOTS);
    });
  });

  it('拒绝快照目录自身路径', () => {
    withTempData((dir) => {
      expect(() => listSnapshots(dir, '.snapshots/x')).toThrowError(/路径非法/);
      expect(() => createSnapshot(dir, 'assets/a.png')).toThrowError(/路径非法/);
    });
  });
});

describe('restoreSnapshot', () => {
  it('回滚前先把当前版本入快照，再覆盖为目标版本', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, REL), 'v1');
      createSnapshot(dir, REL, new Date('2026-01-01T00:00:00.000Z'));
      writeFileSync(path.join(dir, REL), 'v2-current');
      restoreSnapshot(dir, REL, '20260101T000000000', new Date('2026-02-02T00:00:00.000Z'));
      expect(readFileSync(path.join(dir, REL), 'utf8')).toBe('v1');
      // 回滚时的当前版 v2 也被保留
      const list = listSnapshots(dir, REL);
      expect(list.map((s) => s.ts)).toContain('20260202T000000000');
      expect(
        readFileSync(path.join(dir, '.snapshots', REL, '20260202T000000000'), 'utf8')
      ).toBe('v2-current');
    });
  });

  it('快照时间戳不存在时报错', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, REL), 'v1');
      expect(() => restoreSnapshot(dir, REL, '20990101T000000000')).toThrowError(/快照不存在/);
      expect(existsSync(path.join(dir, REL))).toBe(true);
    });
  });

  it('时间戳参数必须是合法格式（防穿越）', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, REL), 'v1');
      expect(() => restoreSnapshot(dir, REL, '../index.md')).toThrowError(/路径非法/);
      expect(() => restoreSnapshot(dir, REL, '2026-01-01')).toThrowError(/路径非法/);
    });
  });
});
