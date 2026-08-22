import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { safeResolve, assertSnapshottable } from '../admin/server/paths.ts';

const DATA = path.resolve('/tmp/admin-paths-data');

describe('safeResolve 路径穿越防护', () => {
  it('解析常规相对路径', () => {
    expect(safeResolve(DATA, 'pages/zh/index.md')).toBe(path.join(DATA, 'pages/zh/index.md'));
    expect(safeResolve(DATA, 'site.yaml')).toBe(path.join(DATA, 'site.yaml'));
  });

  it('拒绝 .. 穿越', () => {
    expect(() => safeResolve(DATA, '../secret.txt')).toThrowError(/路径非法/);
    expect(() => safeResolve(DATA, 'pages/../../secret.txt')).toThrowError(/路径非法/);
    expect(() => safeResolve(DATA, 'pages/%2e%2e/x')).toThrowError(/路径非法/);
  });

  it('拒绝绝对路径与盘符', () => {
    expect(() => safeResolve(DATA, '/etc/passwd')).toThrowError(/路径非法/);
    expect(() => safeResolve(DATA, 'C:/Windows/x')).toThrowError(/路径非法/);
    expect(() => safeResolve(DATA, 'C:\\Windows\\x')).toThrowError(/路径非法/);
  });

  it('拒绝反斜杠、空段与空路径', () => {
    expect(() => safeResolve(DATA, 'pages\\..\\x')).toThrowError(/路径非法/);
    expect(() => safeResolve(DATA, 'pages//x')).toThrowError(/路径非法/);
    expect(() => safeResolve(DATA, '')).toThrowError(/路径非法/);
    expect(() => safeResolve(DATA, '.')).toThrowError(/路径非法/);
  });

  it('拒绝 NUL 与首尾点号的伪装', () => {
    expect(() => safeResolve(DATA, 'pages/x.md\0.png')).toThrowError(/路径非法/);
  });

  it('URL 编码的穿越同样被拒', () => {
    expect(() => safeResolve(DATA, decodeURIComponent('%2e%2e/%2e%2e/x'))).toThrowError(/路径非法/);
  });
});

describe('assertSnapshottable 快照范围限制', () => {
  it('允许 pages 与 yaml 配置', () => {
    expect(() => assertSnapshottable('pages/zh/index.md')).not.toThrow();
    expect(() => assertSnapshottable('site.yaml')).not.toThrow();
    expect(() => assertSnapshottable('rss.yaml')).not.toThrow();
    expect(() => assertSnapshottable('streaming/zh/welcome.md')).not.toThrow();
  });

  it('禁止快照目录自身与素材', () => {
    expect(() => assertSnapshottable('.snapshots/pages/x/20260101T000000000')).toThrowError(/路径非法/);
    expect(() => assertSnapshottable('assets/photo.png')).toThrowError(/路径非法/);
    expect(() => assertSnapshottable('other/file.txt')).toThrowError(/路径非法/);
  });
});
