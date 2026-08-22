import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveDataDir } from '../src/lib/data-dir.ts';

function withTempRoot(structure: string[], fn: (root: string) => void) {
  const root = mkdtempSync(path.join(tmpdir(), 'oh-datadir-'));
  try {
    for (const dir of structure) mkdirSync(path.join(root, dir), { recursive: true });
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('resolveDataDir', () => {
  it('data/ 存在时优先使用，不告警', () => {
    withTempRoot(['data', 'data.example'], (root) => {
      const warn = vi.fn();
      expect(resolveDataDir(root, warn)).toBe(path.join(root, 'data'));
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it('data/ 缺失时回退 data.example/ 并告警', () => {
    withTempRoot(['data.example'], (root) => {
      const warn = vi.fn();
      expect(resolveDataDir(root, warn)).toBe(path.join(root, 'data.example'));
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('data.example');
    });
  });

  it('两者都不存在时抛出中文错误提示 npm run setup', () => {
    withTempRoot([], (root) => {
      expect(() => resolveDataDir(root, vi.fn())).toThrowError(/npm run setup/);
    });
  });
});
