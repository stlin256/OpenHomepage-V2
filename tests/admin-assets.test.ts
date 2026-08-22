import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { listAssets, saveAsset, deleteAsset, readAsset } from '../admin/server/assets.ts';

function withTempData(fn: (dir: string) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'oh-admin-assets-'));
  try {
    mkdirSync(path.join(dir, 'assets'), { recursive: true });
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('listAssets', () => {
  it('列出文件名、大小与修改时间，跳过隐藏文件', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, 'assets/photo.png'), Buffer.alloc(10));
      writeFileSync(path.join(dir, 'assets/.hidden'), 'x');
      const list = listAssets(dir);
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('photo.png');
      expect(list[0].size).toBe(10);
      expect(typeof list[0].mtime).toBe('string');
    });
  });
});

describe('saveAsset', () => {
  it('保存二进制内容并返回最终文件名', () => {
    withTempData((dir) => {
      const buf = Buffer.from([1, 2, 3, 4]);
      const r = saveAsset(dir, 'shot.png', buf);
      expect(r.name).toBe('shot.png');
      expect(readFileSync(path.join(dir, 'assets/shot.png'))).toEqual(buf);
    });
  });

  it('同名冲突自动改名（-1 后缀）', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, 'assets/shot.png'), 'old');
      const r = saveAsset(dir, 'shot.png', Buffer.from('new'));
      expect(r.name).toBe('shot-1.png');
      expect(readFileSync(path.join(dir, 'assets/shot.png'), 'utf8')).toBe('old');
    });
  });

  it('拒绝不支持的扩展名与非法文件名', () => {
    withTempData((dir) => {
      expect(() => saveAsset(dir, 'evil.exe', Buffer.from('x'))).toThrowError(/扩展名/);
      expect(() => saveAsset(dir, '../x.png', Buffer.from('x'))).toThrowError(/非法/);
      expect(() => saveAsset(dir, 'a/b.png', Buffer.from('x'))).toThrowError(/非法/);
    });
  });

  it('超限文件拒绝写入', () => {
    withTempData((dir) => {
      const big = Buffer.alloc(21 * 1024 * 1024);
      expect(() => saveAsset(dir, 'big.png', big)).toThrowError(/大小|20/);
      expect(existsSync(path.join(dir, 'assets/big.png'))).toBe(false);
    });
  });
});

describe('readAsset / deleteAsset', () => {
  it('读取素材内容（供取色器 canvas）', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, 'assets/avatar.png'), Buffer.from([9, 9]));
      expect(readAsset(dir, 'avatar.png')).toEqual(Buffer.from([9, 9]));
      expect(() => readAsset(dir, 'nope.png')).toThrowError(/不存在/);
    });
  });

  it('删除素材；不存在时报错', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, 'assets/a.png'), 'x');
      deleteAsset(dir, 'a.png');
      expect(existsSync(path.join(dir, 'assets/a.png'))).toBe(false);
      expect(() => deleteAsset(dir, 'a.png')).toThrowError(/不存在/);
    });
  });
});
