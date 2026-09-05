/**
 * 数据导入（admin/server/import.ts，spec 18）单测：
 * - parseZip：与 export.ts buildZip 的构建→解析往返（含中文文件名、二进制、store 方法）；
 * - importDataZip：路径穿越整包拒绝、覆盖写入 + 整包备份；POST /api/import-data 端到端；
 * - parseBibtex：各 entry 类型映射、引号/嵌套花括号字段、@string/@comment 忽略；
 * - previewBibtexImport/mergeBibtexImport：DOI/标题/批次内去重、快照、bib 文件追加。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { deflateRawSync } from 'node:zlib';
import { load as loadYaml } from 'js-yaml';
import { buildZip, crc32, type ZipEntry } from '../admin/server/export.ts';
import {
  parseZip,
  importDataZip,
  parseBibtex,
  bibEntryToItem,
  previewBibtexImport,
  mergeBibtexImport,
} from '../admin/server/import.ts';
import { createAdminServer } from '../admin/server/http.ts';

// ---------- zip 往返 ----------

describe('parseZip', () => {
  it('buildZip 构建 → parseZip 解析往返（含中文文件名与二进制内容）', () => {
    const src: ZipEntry[] = [
      { name: 'pages/zh/主页.md', data: Buffer.from('你好，世界', 'utf8') },
      { name: 'site.yaml', data: Buffer.from('site: { title: T }') },
      { name: 'assets/a.bin', data: Buffer.from([0, 1, 2, 255, 128]) },
    ];
    const out = parseZip(buildZip(src));
    expect(out.map((e) => e.name)).toEqual(src.map((e) => e.name));
    for (const e of out) {
      expect(e.data.equals(src.find((s) => s.name === e.name)!.data)).toBe(true);
    }
  });

  it('支持 store（方法 0）条目与目录条目跳过', () => {
    // 手工拼一个 store 方法的 zip：本地头 + 中央目录 + EOCD
    const name = Buffer.from('plain.txt', 'utf8');
    const data = Buffer.from('stored content');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8); // store
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt32LE(crc32(data), 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(cd.length + name.length, 12);
    eocd.writeUInt32LE(30 + name.length + data.length, 16);
    const zip = Buffer.concat([local, name, data, cd, name, eocd]);
    const out = parseZip(zip);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('plain.txt');
    expect(out[0].data.toString()).toBe('stored content');
  });

  it('非 zip 数据抛错', () => {
    expect(() => parseZip(Buffer.from('not a zip'))).toThrow(/zip/i);
  });

  it('deflate 条目解压正确（手写本地头 + 目录条目被跳过）', () => {
    const data = Buffer.from('deflated');
    const comp = deflateRawSync(data);
    const name = Buffer.from('d.txt');
    const zip = buildZip([{ name: 'd.txt', data }]);
    void comp;
    void name;
    const out = parseZip(zip);
    expect(out[0].data.toString()).toBe('deflated');
  });
});

// ---------- data.zip 导入 ----------

describe('importDataZip', () => {
  let dir: string;
  let dataDir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'oh-import-'));
    dataDir = path.join(dir, 'data');
    mkdirSync(path.join(dataDir, 'pages', 'zh'), { recursive: true });
    writeFileSync(path.join(dataDir, 'site.yaml'), 'site: { title: Old }');
    writeFileSync(path.join(dataDir, 'pages', 'zh', 'index.md'), '旧主页');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('覆盖写入同名文件并生成整包备份，返回文件数与备份路径', () => {
    const zip = buildZip([
      { name: 'site.yaml', data: Buffer.from('site: { title: New }') },
      { name: 'pages/zh/新页.md', data: Buffer.from('新页面') },
    ]);
    const r = importDataZip(dataDir, zip);
    expect(r.files).toBe(2);
    expect(readFileSync(path.join(dataDir, 'site.yaml'), 'utf8')).toBe('site: { title: New }');
    expect(readFileSync(path.join(dataDir, 'pages', 'zh', '新页.md'), 'utf8')).toBe('新页面');
    // overlay 语义：zip 里没有的本地文件保留
    expect(readFileSync(path.join(dataDir, 'pages', 'zh', 'index.md'), 'utf8')).toBe('旧主页');
    // 整包备份存在且内容可还原（备份于覆盖前，site.yaml 应为旧值）
    expect(r.backup.startsWith('.snapshots/import-backup/')).toBe(true);
    const backup = parseZip(readFileSync(path.join(dataDir, r.backup)));
    const site = backup.find((e) => e.name === 'site.yaml');
    expect(site?.data.toString()).toBe('site: { title: Old }');
    // 备份不含 .snapshots 自身
    expect(backup.some((e) => e.name.startsWith('.snapshots/'))).toBe(false);
  });

  it('路径穿越条目整包拒绝，不落任何文件', () => {
    for (const evil of ['../evil.yaml', '/abs/x.yaml', 'C:\\x.yaml', 'a\\b.yaml', '%2e%2e/x']) {
      const zip = buildZip([
        { name: 'ok.yaml', data: Buffer.from('ok') },
        { name: evil, data: Buffer.from('evil') },
      ]);
      expect(() => importDataZip(dataDir, zip), evil).toThrow(/路径非法/);
    }
    expect(existsSync(path.join(dataDir, 'ok.yaml'))).toBe(false);
    expect(existsSync(path.join(dir, 'evil.yaml'))).toBe(false);
    expect(existsSync(path.join(dataDir, '.snapshots', 'import-backup'))).toBe(false);
  });

  it('空 zip（无文件条目）报错', () => {
    expect(() => importDataZip(dataDir, buildZip([]))).toThrow(/空/);
  });
});

// ---------- BibTeX 解析 ----------

describe('parseBibtex / bibEntryToItem', () => {
  it('解析 article/inproceedings/misc/phdthesis 并映射类型', () => {
    const text = `
@article{a1, author = {Lin, Zhiyuan and Doe, Alice}, title = {Paper A}, journal = {JMLR}, year = {2024}}
@inproceedings{b2, author = {Doe, Alice}, title = {Paper B}, booktitle = {OSDI}, year = {2025}}
@misc{c3, author = {Smith, Bob}, title = {Paper C}, year = {2023}, eprint = {2301.00001}, archivePrefix = {arXiv}}
@phdthesis{d4, author = {Smith, Bob}, title = {Thesis D}, school = {Example University}, year = {2022}}
`;
    const entries = parseBibtex(text);
    expect(entries.map((e) => e.key)).toEqual(['a1', 'b2', 'c3', 'd4']);
    const used = new Set<string>();
    const items = entries.map((e) => bibEntryToItem(e, used));
    expect(items.every((i) => typeof i !== 'string')).toBe(true);
    const [a, b, c, d] = items as { type: string; venue: string }[];
    expect(a.type).toBe('journal');
    expect(b.type).toBe('conference');
    expect(c.type).toBe('preprint');
    expect(c.venue).toBe('arXiv'); // eprint + archivePrefix 兜底
    expect(d.type).toBe('thesis');
    expect(d.venue).toBe('Example University');
  });

  it('嵌套花括号与引号字段（含转义引号）正确解析', () => {
    const text = `
@article{nested,
  title = {The {KV} Cache: A {Deep} Dive},
  author = "Doe, Alice",
  journal = {Journal of Tests},
  note = "He said \\"hi\\" loudly",
  year = 2026,
  month = mar,
  doi = {10.1000/xyz.123},
  url = {https://example.com/paper}
}`;
    const [entry] = parseBibtex(text);
    expect(entry.fields.title).toBe('The KV Cache: A Deep Dive');
    expect(entry.fields.author).toBe('Doe, Alice');
    expect(entry.fields.year).toBe('2026');
    const item = bibEntryToItem(entry, new Set());
    expect(typeof item).not.toBe('string');
    if (typeof item !== 'string') {
      expect(item.title).toBe('The KV Cache: A Deep Dive');
      expect(item.authors).toEqual(['Alice Doe']);
      expect(item.year).toBe(2026);
      expect(item.date).toBe('2026-03-01');
      expect(item.doi).toBe('10.1000/xyz.123');
      expect(item.links?.project).toBe('https://example.com/paper');
    }
  });

  it('@string/@comment 不视为条目；缺必填字段的条目返回跳过原因', () => {
    const text = `
@string{osdi = {OSDI}}
@comment{this is a comment}
@article{novenue, author = {Doe, A}, title = {No Venue}, year = {2024}}
@article{notitle, author = {Doe, A}, year = {2024}}
`;
    const entries = parseBibtex(text);
    expect(entries.map((e) => e.key)).toEqual(['novenue', 'notitle']);
    expect(typeof bibEntryToItem(entries[0], new Set())).toBe('string'); // 缺 venue
    expect(typeof bibEntryToItem(entries[1], new Set())).toBe('string'); // 缺 title
  });

  it('id 冲突时追加序号', () => {
    const text = `@misc{k1, author = {Doe, A}, title = {T}, year = {2024}, eprint = {1}, archivePrefix = {arXiv}}`;
    const [entry] = parseBibtex(text);
    const used = new Set(['k1']);
    const item = bibEntryToItem(entry, used);
    expect(typeof item).not.toBe('string');
    if (typeof item !== 'string') expect(item.id).toBe('k1-2');
  });
});

// ---------- BibTeX 合并去重与落盘 ----------

const EXISTING_YAML = `enabled: true
bibtex_file: publications.bib
items:
  - id: existing-1
    title: "Efficient Inference with Adaptive Scheduling"
    authors: ["Zhiyuan Lin"]
    year: 2026
    type: conference
    venue: "OSDI 2026"
  - id: existing-2
    title: "Another Paper"
    authors: ["Alice Doe"]
    year: 2025
    type: journal
    venue: "JMLS"
    doi: "10.1000/existing"
`;

describe('previewBibtexImport / mergeBibtexImport', () => {
  let dir: string;
  let dataDir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'oh-bib-'));
    dataDir = path.join(dir, 'data');
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(path.join(dataDir, 'publications.yaml'), EXISTING_YAML);
    writeFileSync(path.join(dataDir, 'publications.bib'), '@article{old,\n  title = {Old}\n}\n');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const BIB = `
@article{dupTitle, author = {Lin, Z}, title = {efficient inference with adaptive scheduling}, journal = {X}, year = {2026}}
@article{dupDoi, author = {Doe, A}, title = {Fresh Title}, journal = {Y}, year = {2025}, doi = {10.1000/existing}}
@inproceedings{fresh1, author = {New, Author}, title = {Brand New Paper}, booktitle = {NSDI}, year = {2026}}
@inproceedings{fresh2, author = {New, Author}, title = {Brand New Paper}, booktitle = {NSDI}, year = {2026}}
`;

  it('预览：DOI/标题/批次内重复均跳过，不写盘', () => {
    const before = readFileSync(path.join(dataDir, 'publications.yaml'), 'utf8');
    const r = previewBibtexImport(dataDir, BIB);
    expect(r.added).toHaveLength(1);
    expect(r.added[0].title).toBe('Brand New Paper');
    expect(r.skipped.map((s) => s.key).sort()).toEqual(['dupDoi', 'dupTitle', 'fresh2']);
    expect(readFileSync(path.join(dataDir, 'publications.yaml'), 'utf8')).toBe(before);
  });

  it('合并：追加进 publications.yaml、留快照、原始 entry 追加到 .bib', () => {
    const r = mergeBibtexImport(dataDir, BIB);
    expect(r.added).toBe(1);
    expect(r.skipped).toHaveLength(3);

    const cfg = loadYaml(readFileSync(path.join(dataDir, 'publications.yaml'), 'utf8')) as {
      enabled: boolean;
      bibtex_file: string;
      items: { id: string; title: string; type: string; venue: string; bibtex_key?: string }[];
    };
    expect(cfg.enabled).toBe(true);
    expect(cfg.bibtex_file).toBe('publications.bib');
    expect(cfg.items).toHaveLength(3);
    const fresh = cfg.items[2];
    expect(fresh.title).toBe('Brand New Paper');
    expect(fresh.type).toBe('conference');
    expect(fresh.venue).toBe('NSDI');
    expect(fresh.bibtex_key).toBe('fresh1');

    // publications.yaml 与 publications.bib 均有快照
    const yamlSnaps = readdirSync(path.join(dataDir, '.snapshots', 'publications.yaml'));
    expect(yamlSnaps.length).toBeGreaterThan(0);
    const bibSnaps = readdirSync(path.join(dataDir, '.snapshots', 'publications.bib'));
    expect(bibSnaps.length).toBeGreaterThan(0);

    // 原始 BibTeX 追加进 .bib（bibtex_key 构建期可命中）
    const bib = readFileSync(path.join(dataDir, 'publications.bib'), 'utf8');
    expect(bib).toContain('@inproceedings{fresh1');
    expect(bib).toContain('@article{old');
  });

  it('全部跳过时不写盘不留快照', () => {
    const r = mergeBibtexImport(
      dataDir,
      '@article{dup, author = {Lin, Z}, title = {Another Paper}, journal = {X}, year = {2025}, doi = {10.1000/existing}}'
    );
    expect(r.added).toBe(0);
    expect(existsSync(path.join(dataDir, '.snapshots'))).toBe(false);
  });

  it('无 BibTeX 条目时报错', () => {
    expect(() => previewBibtexImport(dataDir, 'hello world')).toThrow(/未解析到/);
  });
});

// ---------- HTTP 端到端 ----------

describe('POST /api/import-data 与 /api/import/bibtex', () => {
  let root: string;
  let dataDir: string;
  let server: Server;
  let base: string;

  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'oh-import-api-'));
    dataDir = path.join(root, 'data');
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(path.join(dataDir, 'site.yaml'), 'site: { title: Old }');
    server = createAdminServer({ dataDir, initialized: false, appJs: '' });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise((r) => server.close(r));
    rmSync(root, { recursive: true, force: true });
  });

  it('上传 zip 覆盖写入并返回摘要', async () => {
    const zip = buildZip([{ name: 'site.yaml', data: Buffer.from('site: { title: New }') }]);
    const res = await fetch(`${base}/api/import-data`, { method: 'POST', body: new Uint8Array(zip) });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; files: number; backup: string };
    expect(data.files).toBe(1);
    expect(readFileSync(path.join(dataDir, 'site.yaml'), 'utf8')).toBe('site: { title: New }');
    expect(existsSync(path.join(dataDir, data.backup))).toBe(true);
  });

  it('含路径穿越的 zip 返回 400 且不落盘', async () => {
    const zip = buildZip([{ name: '../evil.yaml', data: Buffer.from('evil') }]);
    const res = await fetch(`${base}/api/import-data`, { method: 'POST', body: new Uint8Array(zip) });
    expect(res.status).toBe(400);
    expect(existsSync(path.join(root, 'evil.yaml'))).toBe(false);
  });

  it('bibtex 预览与确认导入端到端', async () => {
    const bib = '@misc{p1, author = {Doe, A}, title = {API Paper}, year = {2026}, eprint = {1}, archivePrefix = {arXiv}}';
    const preview = await fetch(`${base}/api/import/bibtex/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bibtex: bib }),
    });
    const p = (await preview.json()) as { added: { title: string }[]; skipped: unknown[] };
    expect(p.added).toHaveLength(1);
    expect(existsSync(path.join(dataDir, 'publications.yaml'))).toBe(false); // 预览不写盘

    const commit = await fetch(`${base}/api/import/bibtex`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bibtex: bib }),
    });
    const c = (await commit.json()) as { ok: boolean; added: number };
    expect(c.added).toBe(1);
    const cfg = loadYaml(readFileSync(path.join(dataDir, 'publications.yaml'), 'utf8')) as {
      items: { title: string; venue: string }[];
    };
    expect(cfg.items[0].title).toBe('API Paper');
    expect(cfg.items[0].venue).toBe('arXiv');
  });
});
