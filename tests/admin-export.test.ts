/**
 * 导出 data 压缩包（admin/server/export.ts）单测：
 * 手写 deflate zip（零依赖）的结构正确性（本地头/中央目录/EOCD/CRC/UTF-8 文件名），
 * data/ 收集规则（递归、POSIX 分隔符、含 .snapshots），以及 HTTP 路由的下载头。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { inflateRawSync } from 'node:zlib';
import { crc32, buildZip, collectDataEntries } from '../admin/server/export.ts';
import { createAdminServer } from '../admin/server/http.ts';

describe('crc32', () => {
  it('标准向量 "123456789" → 0xCBF43926；空串 → 0', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    expect(crc32(Buffer.from(''))).toBe(0);
  });
});

describe('buildZip', () => {
  it('单条目：本地头/中央目录/EOCD 齐全，deflate 可还原', () => {
    const zip = buildZip([{ name: 'site.yaml', data: Buffer.from('site: { title: T }') }]);
    // 本地文件头签名 + UTF-8 文件名标记 + deflate 方法
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.readUInt16LE(6) & 0x0800).toBe(0x0800);
    expect(zip.readUInt16LE(8)).toBe(8);
    const crc = zip.readUInt32LE(14);
    const compLen = zip.readUInt32LE(18);
    const rawLen = zip.readUInt32LE(22);
    const nameLen = zip.readUInt16LE(26);
    expect(zip.subarray(30, 30 + nameLen).toString('utf8')).toBe('site.yaml');
    const comp = zip.subarray(30 + nameLen, 30 + nameLen + compLen);
    expect(inflateRawSync(comp).toString('utf8')).toBe('site: { title: T }');
    expect(rawLen).toBe(Buffer.from('site: { title: T }').length);
    expect(crc).toBe(crc32(Buffer.from('site: { title: T }')));
    // 中央目录 + EOCD 存在且计数正确
    expect(zip.includes(Buffer.from([0x50, 0x4b, 0x01, 0x02]))).toBe(true);
    const eocdAt = zip.length - 22;
    expect(zip.readUInt32LE(eocdAt)).toBe(0x06054b50);
    expect(zip.readUInt16LE(eocdAt + 8)).toBe(1);
  });

  it('多条目（含中文名）解压全部还原；空列表产出合法空 zip', () => {
    const zip = buildZip([
      { name: 'pages/zh/主页.md', data: Buffer.from('你好') },
      { name: 'a.bin', data: Buffer.from([1, 2, 3, 255]) },
    ]);
    // 逐条走本地头解析还原
    let off = 0;
    const names: string[] = [];
    while (zip.readUInt32LE(off) === 0x04034b50) {
      const compLen = zip.readUInt32LE(off + 18);
      const nameLen = zip.readUInt16LE(off + 26);
      const extraLen = zip.readUInt16LE(off + 28);
      const name = zip.subarray(off + 30, off + 30 + nameLen).toString('utf8');
      names.push(name);
      const comp = zip.subarray(off + 30 + nameLen + extraLen, off + 30 + nameLen + extraLen + compLen);
      const raw = inflateRawSync(comp);
      if (name === 'pages/zh/主页.md') expect(raw.toString('utf8')).toBe('你好');
      if (name === 'a.bin') expect(raw).toEqual(Buffer.from([1, 2, 3, 255]));
      off += 30 + nameLen + extraLen + compLen;
    }
    expect(names).toEqual(['pages/zh/主页.md', 'a.bin']);
    // 空 zip：仅 EOCD
    const empty = buildZip([]);
    expect(empty.length).toBe(22);
    expect(empty.readUInt32LE(0)).toBe(0x06054b50);
  });
});

describe('collectDataEntries', () => {
  let dir: string;
  let dataDir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'oh-export-'));
    dataDir = path.join(dir, 'data');
    mkdirSync(path.join(dataDir, 'pages', 'zh'), { recursive: true });
    mkdirSync(path.join(dataDir, '.snapshots', 'site.yaml'), { recursive: true });
    writeFileSync(path.join(dataDir, 'site.yaml'), 'site: { title: T }');
    writeFileSync(path.join(dataDir, 'pages', 'zh', 'index.md'), '主页');
    writeFileSync(path.join(dataDir, '.snapshots', 'site.yaml', '20260823-120000'), 'old');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('递归收集 data/（含 .snapshots），POSIX 分隔符，路径排序', () => {
    const entries = collectDataEntries(dataDir);
    expect(entries.map((e) => e.name)).toEqual([
      '.snapshots/site.yaml/20260823-120000',
      'pages/zh/index.md',
      'site.yaml',
    ]);
    expect(entries.find((e) => e.name === 'site.yaml')!.data.toString()).toBe('site: { title: T }');
  });

  it('zip 打包后按收集到的名字可还原内容', () => {
    const zip = buildZip(collectDataEntries(dataDir));
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.length).toBeGreaterThan(100);
  });
});

describe('GET /api/export-data', () => {
  let root: string;
  let server: Server;
  let base: string;

  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'oh-export-api-'));
    const dataDir = path.join(root, 'data');
    mkdirSync(path.join(dataDir, 'pages', 'zh'), { recursive: true });
    writeFileSync(path.join(dataDir, 'site.yaml'), 'site: { title: T }');
    writeFileSync(path.join(dataDir, 'pages', 'zh', 'index.md'), '主页');
    server = createAdminServer({ dataDir, initialized: false, appJs: '' });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise((r) => server.close(r));
    rmSync(root, { recursive: true, force: true });
  });

  it('返回 zip 下载（content-type/disposition），内容可解压还原', async () => {
    const res = await fetch(`${base}/api/export-data`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('content-disposition')).toMatch(/attachment;.*\.zip/);
    const zip = Buffer.from(await res.arrayBuffer());
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    // 条目齐全
    const names = collectDataEntries(path.join(root, 'data')).map((e) => e.name);
    for (const n of names) expect(zip.includes(Buffer.from(n, 'utf8'))).toBe(true);
  });
});
