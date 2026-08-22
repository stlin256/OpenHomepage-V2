import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ensureDataDir } from '../admin/server/setup.ts';

function withTempRoot(fn: (root: string) => void) {
  const root = mkdtempSync(path.join(tmpdir(), 'oh-admin-setup-'));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function makeExample(root: string) {
  mkdirSync(path.join(root, 'data.example/pages/zh'), { recursive: true });
  writeFileSync(path.join(root, 'data.example/site.yaml'), 'site: {title: t}\n');
  writeFileSync(path.join(root, 'data.example/pages/zh/index.md'), '---\ntitle: 主页\n---\n');
}

describe('ensureDataDir', () => {
  it('data/ 已存在时原样返回且不覆盖', () => {
    withTempRoot((root) => {
      makeExample(root);
      mkdirSync(path.join(root, 'data'));
      writeFileSync(path.join(root, 'data/mine.txt'), 'real');
      const r = ensureDataDir(root);
      expect(r.initialized).toBe(false);
      expect(r.dataDir).toBe(path.join(root, 'data'));
      expect(readFileSync(path.join(root, 'data/mine.txt'), 'utf8')).toBe('real');
      expect(existsSync(path.join(root, 'data/site.yaml'))).toBe(false);
    });
  });

  it('data/ 缺失时从 data.example/ 拷贝并标记 initialized', () => {
    withTempRoot((root) => {
      makeExample(root);
      const r = ensureDataDir(root);
      expect(r.initialized).toBe(true);
      expect(readFileSync(path.join(root, 'data/site.yaml'), 'utf8')).toContain('title: t');
      expect(existsSync(path.join(root, 'data/pages/zh/index.md'))).toBe(true);
    });
  });

  it('两者都缺失时抛错', () => {
    withTempRoot((root) => {
      expect(() => ensureDataDir(root)).toThrowError(/data\.example/);
    });
  });
});
