/**
 * 数据导入（spec 18，docs/specs/18-admin-data-import.md）：
 * 1. data.zip 导入：与 export.ts 对称的零依赖 zip 解析（中央目录定位 + zlib.inflateRawSync），
 *    路径过 safeResolve 校验，覆盖前把当前 data/（不含 .snapshots）整包备份到
 *    .snapshots/import-backup/<timestamp>.zip；
 * 2. BibTeX 导入：零依赖容错解析 → 映射为 publications.yaml 条目（spec 13 §1.2 schema），
 *    DOI/标题去重，写入走 createSnapshot + dump + notifyWrite 的既有保存链路。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { load as loadYaml, dump as dumpYaml } from 'js-yaml';
import { buildZip, collectDataEntries, type ZipEntry } from './export.ts';
import { createSnapshot, formatTimestamp } from './snapshots.ts';
import { notifyWrite } from './history.ts';
import { safeResolve } from './paths.ts';

// ---------- zip 解析（export.ts buildZip 的逆向；支持 deflate(8)/store(0)） ----------

function findEocd(buf: Buffer): number {
  // EOCD 最大偏移：注释最长 65535 字节，从尾部 64KB+22 范围内找签名
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error('不是合法的 zip 文件（找不到 EOCD）/ Not a zip file');
}

/** 解析 zip 为条目列表（目录条目跳过；不支持的压缩方法抛错） */
export function parseZip(buf: Buffer): ZipEntry[] {
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const out: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('zip 中央目录损坏 / Corrupt zip');
    const method = buf.readUInt16LE(off + 10);
    const compLen = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.subarray(off + 46, off + 46 + nameLen).toString('utf8');
    off += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue; // 目录条目

    if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error('zip 本地文件头损坏 / Corrupt zip');
    const localNameLen = buf.readUInt16LE(localOff + 26);
    const localExtraLen = buf.readUInt16LE(localOff + 28);
    const dataOff = localOff + 30 + localNameLen + localExtraLen;
    const comp = buf.subarray(dataOff, dataOff + compLen);
    let data: Buffer;
    if (method === 8) data = inflateRawSync(comp);
    else if (method === 0) data = Buffer.from(comp);
    else throw new Error(`不支持的 zip 压缩方法：${method}（条目 ${name}）/ Unsupported compression method`);
    out.push({ name, data });
  }
  return out;
}

// ---------- data.zip 导入 ----------

export interface ImportDataResult {
  ok: true;
  /** 写入的文件数 */
  files: number;
  /** 覆盖前整包备份的相对路径（data/ 内） */
  backup: string;
}

/**
 * 导入 data.zip：全部条目先过 safeResolve（任一路径非法则整包拒绝、不落盘），
 * 再把当前 data/（不含 .snapshots）备份为 .snapshots/import-backup/<ts>.zip，最后覆盖写入。
 * overlay 语义：只覆盖同名文件，不删除 zip 中不存在的本地文件。
 */
export function importDataZip(dataDir: string, zipBuf: Buffer, now: Date = new Date()): ImportDataResult {
  const entries = parseZip(zipBuf);
  if (entries.length === 0) throw new Error('压缩包为空（无文件条目）/ Empty zip');
  // 先全量校验路径，再动盘：任一非法整包拒绝
  const targets = entries.map((e) => ({ entry: e, abs: safeResolve(dataDir, e.name) }));

  // 覆盖前整包备份当前 data/（排除 .snapshots，避免快照套快照膨胀）
  const backupRel = `.snapshots/import-backup/${formatTimestamp(now)}.zip`;
  const current = collectDataEntries(dataDir).filter((e) => !e.name.startsWith('.snapshots/'));
  const backupZip = buildZip(current);
  const backupAbs = path.join(dataDir, ...backupRel.split('/'));
  mkdirSync(path.dirname(backupAbs), { recursive: true });
  writeFileSync(backupAbs, backupZip);

  for (const { entry, abs } of targets) {
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, entry.data);
  }
  return { ok: true, files: entries.length, backup: backupRel };
}

// ---------- BibTeX 解析 ----------

export interface BibEntry {
  /** entry 类型（小写，如 article / inproceedings） */
  type: string;
  key: string;
  /** 字段名小写 → 归一化后的值 */
  fields: Record<string, string>;
  /** 原始 BibTeX 文本（追加回 publications.bib 用） */
  raw: string;
}

const BIB_ENTRY_HEAD = /@([a-zA-Z]+)\s*[({]\s*([^,}\s]+)\s*,/g;
const BIB_SKIP_TYPES = new Set(['string', 'preamble', 'comment']);

/** 从 open 处（'{' 或 '('）按括号深度截取到配平位置，返回结束下标；不平衡返回 -1 */
function matchBrace(text: string, open: number): number {
  const openCh = text[open];
  const closeCh = openCh === '{' ? '}' : ')';
  let depth = 0;
  let quote = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '"' && text[i - 1] !== '\\') quote = false;
      continue;
    }
    if (ch === '"') quote = true;
    else if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 字段值归一化：剥外层括号/引号、剥内层包裹花括号、压缩连续空白 */
function cleanBibValue(value: string): string {
  let v = value.trim();
  if ((v.startsWith('{') && v.endsWith('}')) || (v.startsWith('"') && v.endsWith('"'))) {
    v = v.slice(1, -1);
  }
  return v.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

/** 解析 entry 体（key 之后到配平括号之间）为字段表；逗号分隔只在顶层生效 */
function parseBibFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let i = 0;
  while (i < body.length) {
    // 跳过空白与逗号
    while (i < body.length && /[\s,]/.test(body[i])) i++;
    if (i >= body.length) break;
    // 字段名
    const nameMatch = /^[a-zA-Z][a-zA-Z0-9_-]*/.exec(body.slice(i));
    if (!nameMatch) break;
    const name = nameMatch[0].toLowerCase();
    i += nameMatch[0].length;
    while (i < body.length && /\s/.test(body[i])) i++;
    if (body[i] !== '=') break;
    i++;
    while (i < body.length && /\s/.test(body[i])) i++;
    // 字段值：{...} / "..." / 裸 token
    let raw: string;
    if (body[i] === '{') {
      const end = matchBrace(body, i);
      if (end < 0) break;
      raw = body.slice(i, end + 1);
      i = end + 1;
    } else if (body[i] === '"') {
      let j = i + 1;
      while (j < body.length && !(body[j] === '"' && body[j - 1] !== '\\')) j++;
      raw = body.slice(i, Math.min(j + 1, body.length));
      i = j + 1;
    } else {
      const tok = /^[^,\s]+/.exec(body.slice(i));
      if (!tok) break;
      raw = tok[0];
      i += tok[0].length;
    }
    fields[name] = cleanBibValue(raw);
  }
  return fields;
}

/** 容错解析 BibTeX 文本；@string/@preamble/@comment 与括号不平衡的 entry 跳过 */
export function parseBibtex(text: string): BibEntry[] {
  const entries: BibEntry[] = [];
  BIB_ENTRY_HEAD.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BIB_ENTRY_HEAD.exec(text))) {
    const type = match[1].toLowerCase();
    if (BIB_SKIP_TYPES.has(type)) continue;
    const open = match.index + match[0].length - 1; // 指向 key 后的逗号
    // entry 的左括号（'{' 或 '('）：@type 之后的首个括号（之间只可能有空白与 key）
    const b = text.indexOf('{', match.index + 1);
    const p = text.indexOf('(', match.index + 1);
    const actualOpen = b < 0 ? p : p < 0 ? b : Math.min(b, p);
    const end = matchBrace(text, actualOpen);
    if (end < 0) continue; // 括号不平衡，跳过
    const body = text.slice(open + 1, end);
    entries.push({
      type,
      key: match[2],
      fields: parseBibFields(body),
      raw: text.slice(match.index, end + 1).trim(),
    });
    BIB_ENTRY_HEAD.lastIndex = end + 1;
  }
  return entries;
}

// ---------- BibTeX → publications.yaml 条目映射 ----------

/** entry 类型 → schema type（src/lib/publications.ts PublicationType） */
const TYPE_MAP: Record<string, string> = {
  article: 'journal',
  inproceedings: 'conference',
  conference: 'conference',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  misc: 'preprint',
  unpublished: 'preprint',
  online: 'preprint',
  techreport: 'preprint',
};

const VENUE_FIELDS = ['journal', 'booktitle', 'publisher', 'school', 'institution', 'organization', 'howpublished'];

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** 作者名：`Last, First` → `First Last`；已是非逗号形态的原样保留 */
function normalizeAuthor(name: string): string {
  const idx = name.indexOf(',');
  if (idx < 0) return name.trim();
  const last = name.slice(0, idx).trim();
  const first = name.slice(idx + 1).trim();
  return first ? `${first} ${last}` : last;
}

function itemIdFromKey(key: string, used: Set<string>): string {
  let base = key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!base) base = 'pub';
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
}

export interface ImportedPubItem {
  id: string;
  title: string;
  authors: string[];
  year: number;
  date?: string;
  type: string;
  venue: string;
  doi?: string;
  abstract?: string;
  links?: { project?: string };
  bibtex_key: string;
}

export interface BibSkip {
  key: string;
  reason: string;
}

export interface BibPreview {
  added: ImportedPubItem[];
  skipped: BibSkip[];
  /** added 与 raw 一一对应（追加 publications.bib 用） */
  raws: string[];
}

/** 单条 BibEntry → item；无法映射（缺必填字段）时返回跳过原因字符串 */
export function bibEntryToItem(entry: BibEntry, usedIds: Set<string>): ImportedPubItem | string {
  const f = entry.fields;
  const title = f.title ?? '';
  if (!title) return '缺少 title 字段';
  const authors = (f.author ?? '')
    .split(/\s+and\s+/i)
    .map((a) => normalizeAuthor(a))
    .filter(Boolean);
  if (authors.length === 0) return '缺少 author 字段';
  const year = Number.parseInt(f.year ?? '', 10);
  if (!Number.isInteger(year)) return '缺少/非法 year 字段';
  let venue = '';
  for (const vf of VENUE_FIELDS) {
    if (f[vf]) { venue = f[vf]; break; }
  }
  if (!venue && f.eprint && (f.archiveprefix ?? '').toLowerCase() === 'arxiv') venue = 'arXiv';
  if (!venue) return '无法确定 venue（journal/booktitle/publisher 等均为空）';

  const item: ImportedPubItem = {
    id: itemIdFromKey(entry.key, usedIds),
    title,
    authors,
    year,
    type: TYPE_MAP[entry.type] ?? 'preprint',
    venue,
    bibtex_key: entry.key,
  };
  const month = (f.month ?? '').toLowerCase();
  const mm = MONTHS[month] ?? (/^(0?[1-9]|1[0-2])$/.test(month) ? month.padStart(2, '0') : '');
  if (mm) item.date = `${year}-${mm}-01`;
  if (f.doi) item.doi = f.doi;
  if (f.abstract) item.abstract = f.abstract;
  if (f.url && /^https?:\/\//i.test(f.url)) item.links = { project: f.url };
  return item;
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, ' ').trim();
}

const DOI_URL_RE = /^https?:\/\/(?:dx\.)?doi\.org\/(.+)$/i;

/** 读现有 publications.yaml（不存在视为空配置），并构建去重索引（DOI 小写 + 归一化标题） */
function readPublicationsRaw(dataDir: string): {
  cfg: Record<string, unknown>;
  items: Record<string, unknown>[];
  dois: Set<string>;
  titles: Set<string>;
  usedIds: Set<string>;
} {
  const file = path.join(dataDir, 'publications.yaml');
  const cfg = (existsSync(file) ? loadYaml(readFileSync(file, 'utf8')) : null) as Record<string, unknown> | null;
  const root: Record<string, unknown> = cfg && typeof cfg === 'object' ? cfg : { enabled: true };
  const items = (Array.isArray(root.items) ? root.items : []) as Record<string, unknown>[];
  if (!Array.isArray(root.items)) root.items = items;
  const dois = new Set<string>();
  const titles = new Set<string>();
  const usedIds = new Set<string>();
  for (const item of items) {
    if (typeof item.id === 'string') usedIds.add(item.id);
    if (typeof item.title === 'string') titles.add(normalizeTitle(item.title));
    if (typeof item.doi === 'string') dois.add(item.doi.toLowerCase());
    // 兼容旧数据：DOI 也可能只存在于 links.* 的 doi.org 链接里
    const links = item.links as Record<string, unknown> | undefined;
    if (links && typeof links === 'object') {
      for (const v of Object.values(links)) {
        const m = typeof v === 'string' ? DOI_URL_RE.exec(v) : null;
        if (m) dois.add(m[1].toLowerCase());
      }
    }
  }
  return { cfg: root, items, dois, titles, usedIds };
}

/** 预览/落盘共用：解析 + 映射 + 去重（DOI 或标题相同跳过；批次内重复同样跳过） */
export function previewBibtexImport(dataDir: string, text: string): BibPreview {
  const { dois, titles, usedIds } = readPublicationsRaw(dataDir);
  const added: ImportedPubItem[] = [];
  const skipped: BibSkip[] = [];
  const raws: string[] = [];
  for (const entry of parseBibtex(text)) {
    const mapped = bibEntryToItem(entry, usedIds);
    if (typeof mapped === 'string') {
      skipped.push({ key: entry.key, reason: mapped });
      continue;
    }
    if (mapped.doi && dois.has(mapped.doi.toLowerCase())) {
      skipped.push({ key: entry.key, reason: 'DOI 与现有条目重复' });
      continue;
    }
    if (titles.has(normalizeTitle(mapped.title))) {
      skipped.push({ key: entry.key, reason: '标题与现有条目重复' });
      continue;
    }
    if (mapped.doi) dois.add(mapped.doi.toLowerCase());
    titles.add(normalizeTitle(mapped.title));
    added.push(mapped);
    raws.push(entry.raw);
  }
  if (added.length === 0 && skipped.length === 0) {
    throw new Error('未解析到任何 BibTeX 条目 / No BibTeX entries found');
  }
  return { added, skipped, raws };
}

/**
 * 确认导入：合并进 publications.yaml（快照 + dump + notifyWrite），
 * 配置 bibtex_file 且文件存在时把原始 BibTeX 追加到该 bib 文件（同样先快照）。
 */
export function mergeBibtexImport(
  dataDir: string,
  text: string
): { ok: true; added: number; skipped: BibSkip[] } {
  const preview = previewBibtexImport(dataDir, text);
  if (preview.added.length === 0) return { ok: true, added: 0, skipped: preview.skipped };

  const { cfg, items } = readPublicationsRaw(dataDir);
  items.push(...(preview.added as unknown as Record<string, unknown>[]));
  createSnapshot(dataDir, 'publications.yaml'); // 文件不存在时返回 null，直接新建
  writeFileSync(path.join(dataDir, 'publications.yaml'), dumpYaml(cfg), 'utf8');
  notifyWrite(dataDir, 'publications.yaml');

  // bibtex_file（如 publications.bib）存在时追加原始 entry，保证 bibtex_key 构建期可命中
  const bibFile = typeof cfg.bibtex_file === 'string' ? cfg.bibtex_file : '';
  if (bibFile) {
    const bibAbs = safeResolve(dataDir, bibFile);
    if (existsSync(bibAbs)) {
      createSnapshot(dataDir, bibFile);
      const prev = readFileSync(bibAbs, 'utf8');
      writeFileSync(bibAbs, `${prev.replace(/\s*$/, '')}\n\n${preview.raws.join('\n\n')}\n`, 'utf8');
      notifyWrite(dataDir, bibFile);
    }
  }
  return { ok: true, added: preview.added.length, skipped: preview.skipped };
}
