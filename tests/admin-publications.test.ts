/**
 * 学术成果逐条编辑保存链路（spec 21 §4）单测：
 * - admin/server/publications.ts：读（宽松往返未知字段）/写（校验 + 快照 + 撤销链）；
 * - HTTP 端点 GET/PUT /api/config/publications（沿用快照断言模式，同 admin-configs.test.ts）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import {
  readPublications,
  writePublications,
  validatePublications,
} from '../admin/server/publications.ts';
import { listSnapshots } from '../admin/server/snapshots.ts';
import { createAdminServer } from '../admin/server/http.ts';

const PUBS = [
  'enabled: true',
  'bibtex_file: publications.bib',
  'highlight_authors:',
  '  - Zhiyuan Lin',
  'items:',
  '  - id: paper-2026',
  '    title: "A Great Paper"',
  '    authors: ["Zhiyuan Lin", "Alice Doe"]',
  '    year: 2026',
  '    type: conference',
  '    venue: "OSDI 2026"',
  '    doi: "10.1234/example"  # 未知字段：编辑往返应保留',
  '  - id: poster-2025',
  '    title: "A Poster"',
  '    authors: ["Alice Doe"]',
  '    year: 2025',
  '    venue: "Some Workshop"',
  '',
].join('\n');

function withTempData(fn: (dir: string) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'oh-admin-pub-'));
  try {
    writeFileSync(path.join(dir, 'publications.yaml'), PUBS);
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('readPublications', () => {
  it('读取为结构化对象，顶层字段与未知条目字段原样保留', () => {
    withTempData((dir) => {
      const cfg = readPublications(dir);
      expect(cfg.enabled).toBe(true);
      expect(cfg.bibtex_file).toBe('publications.bib');
      expect(cfg.highlight_authors).toEqual(['Zhiyuan Lin']);
      expect(cfg.items).toHaveLength(2);
      expect(cfg.items[0].title).toBe('A Great Paper');
      expect(cfg.items[0].doi).toBe('10.1234/example');
    });
  });

  it('文件不存在：返回空配置（enabled 缺省 true，items 空）', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oh-admin-pub-'));
    try {
      const cfg = readPublications(dir);
      expect(cfg.enabled).toBe(true);
      expect(cfg.items).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('YAML 语法错误抛解析错误', () => {
    withTempData((dir) => {
      writeFileSync(path.join(dir, 'publications.yaml'), 'items: [broken');
      expect(() => readPublications(dir)).toThrowError(/YAML|解析/i);
    });
  });
});

describe('validatePublications', () => {
  const valid = (): Record<string, unknown> => ({
    id: 'x-2026',
    title: 'X',
    authors: ['A'],
    year: 2026,
    venue: 'V',
  });

  it('缺 title / 空 authors / 非整数 year / 缺 venue / 缺 id：抛错', () => {
    const cases: [string, Record<string, unknown>][] = [
      ['title', { ...valid(), title: '' }],
      ['authors', { ...valid(), authors: [] }],
      ['year', { ...valid(), year: '2026' }],
      ['venue', { ...valid(), venue: '' }],
      ['id', { ...valid(), id: '' }],
    ];
    for (const [field, item] of cases) {
      expect(() => validatePublications({ items: [item] }), field).toThrowError(/缺少|必须|非法/);
    }
  });

  it('id 重复 / type 不在枚举内：抛错', () => {
    expect(() =>
      validatePublications({ items: [valid(), valid()] })
    ).toThrowError(/重复/);
    expect(() =>
      validatePublications({ items: [{ ...valid(), type: 'movie' }] })
    ).toThrowError(/type/);
  });

  it('合法配置通过（含未知字段 doi）', () => {
    expect(() =>
      validatePublications({ items: [{ ...valid(), doi: '10.1/x', tags: ['a'] }] })
    ).not.toThrow();
  });
});

describe('writePublications', () => {
  it('合法写回并产生快照；未知字段（doi）往返保留', () => {
    withTempData((dir) => {
      const cfg = readPublications(dir);
      cfg.items.push({
        id: 'new-2026',
        title: 'New Paper',
        authors: ['Bob'],
        year: 2026,
        venue: 'New Venue',
      });
      writePublications(dir, cfg);
      const back = readPublications(dir);
      expect(back.items).toHaveLength(3);
      expect(back.items[2].title).toBe('New Paper');
      expect(back.items[0].doi).toBe('10.1234/example');
      expect(back.bibtex_file).toBe('publications.bib');
      expect(listSnapshots(dir, 'publications.yaml')).toHaveLength(1);
    });
  });

  it('校验失败：拒绝写盘且原文件不变、无快照', () => {
    withTempData((dir) => {
      const cfg = readPublications(dir);
      cfg.items[0].title = '';
      expect(() => writePublications(dir, cfg)).toThrowError(/title/);
      expect(readFileSync(path.join(dir, 'publications.yaml'), 'utf8')).toBe(PUBS);
      expect(listSnapshots(dir, 'publications.yaml')).toHaveLength(0);
    });
  });

  it('文件不存在时直接新建（无快照）', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oh-admin-pub-'));
    try {
      writePublications(dir, {
        enabled: true,
        items: [{ id: 'a', title: 'A', authors: ['X'], year: 2024, venue: 'V' }],
      });
      expect(readPublications(dir).items).toHaveLength(1);
      expect(listSnapshots(dir, 'publications.yaml')).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---- HTTP 端点 ----

describe('GET/PUT /api/config/publications', () => {
  let root: string;
  let server: Server;
  let base: string;

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'oh-admin-pub-api-'));
    mkdirSync(path.join(root, 'data'), { recursive: true });
    writeFileSync(path.join(root, 'data', 'publications.yaml'), PUBS);
    server = createAdminServer({ dataDir: path.join(root, 'data'), initialized: false, appJs: '' });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  });

  it('GET 返回整份配置；PUT 合法写回（快照 +1）；非法 PUT 400 不落盘', async () => {
    const get1 = await fetch(`${base}/api/config/publications`).then((r) => r.json());
    expect(get1.data.items).toHaveLength(2);

    const next = get1.data;
    next.items.push({ id: 'b', title: 'B', authors: ['Y'], year: 2023, venue: 'W' });
    const put = await fetch(`${base}/api/config/publications`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: next }),
    });
    expect(put.status).toBe(200);
    const get2 = await fetch(`${base}/api/config/publications`).then((r) => r.json());
    expect(get2.data.items).toHaveLength(3);
    expect(listSnapshots(path.join(root, 'data'), 'publications.yaml')).toHaveLength(1);

    const bad = await fetch(`${base}/api/config/publications`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: { items: [{ id: 'c', title: '', authors: ['Y'], year: 2023, venue: 'W' }] } }),
    });
    expect(bad.status).toBe(400);
    const get3 = await fetch(`${base}/api/config/publications`).then((r) => r.json());
    expect(get3.data.items).toHaveLength(3);
    expect(listSnapshots(path.join(root, 'data'), 'publications.yaml')).toHaveLength(1);
  });
});
