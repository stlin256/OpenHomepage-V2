/**
 * publications.yaml 整文件读写（学术成果逐条图形编辑的保存链路，spec 21 §4）：
 * 读：宽松解析（缺文件视为空配置，未知字段原样保留往返）；
 * 写：逐条校验（必填约束与 src/lib/publications.ts normalizeItem 对齐 + id 唯一）→ 快照 → dump，
 * 与 configs.ts 的 schema 校验 + 快照链路一致。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { load as loadYaml, dump as dumpYaml } from 'js-yaml';
import { createSnapshot } from './snapshots.ts';
import { notifyWrite } from './history.ts';

export const PUBLICATION_TYPES = [
  'conference',
  'journal',
  'workshop',
  'demo',
  'preprint',
  'thesis',
] as const;

export interface PublicationsData {
  enabled?: boolean;
  bibtex_file?: string;
  highlight_authors?: string[];
  /** 条目保留未知字段（如 doi），图形编辑往返不丢 */
  items: Record<string, unknown>[];
  /** 其余顶层字段（未知键）原样保留 */
  [key: string]: unknown;
}

/** 读 publications.yaml；文件不存在视为空配置（enabled 缺省 true，items 空数组） */
export function readPublications(dataDir: string): PublicationsData {
  const file = path.join(dataDir, 'publications.yaml');
  if (!existsSync(file)) return { enabled: true, items: [] };
  let cfg: unknown;
  try {
    cfg = loadYaml(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`YAML 解析失败（publications.yaml）：${(e as Error).message}`);
  }
  const root: PublicationsData =
    cfg && typeof cfg === 'object' && !Array.isArray(cfg)
      ? ({ ...(cfg as Record<string, unknown>) } as PublicationsData)
      : { enabled: true, items: [] };
  root.items = (Array.isArray(root.items) ? root.items : []) as Record<string, unknown>[];
  return root;
}

/**
 * 写前校验（抛错即不落盘）：items 必须是数组；每条 title/authors/year/venue 必填
 * （与渲染端 normalizeItem 一致），id 必填且唯一，type 若给必须在枚举内。
 */
export function validatePublications(cfg: PublicationsData): void {
  if (!Array.isArray(cfg.items)) {
    throw new Error('非法的 publications 配置：items 必须是数组');
  }
  const seen = new Set<string>();
  for (const [i, raw] of cfg.items.entries()) {
    const where = `publications.yaml items[${i}]`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`${where} 必须是对象`);
    }
    const item = raw as Record<string, unknown>;
    if (typeof item.title !== 'string' || !item.title.trim()) {
      throw new Error(`${where} 缺少 title 或字段非法`);
    }
    if (
      !Array.isArray(item.authors) ||
      item.authors.length === 0 ||
      !item.authors.every((a) => typeof a === 'string' && a.trim())
    ) {
      throw new Error(`${where}（${item.title}）缺少 authors 或字段非法`);
    }
    if (!Number.isInteger(item.year)) {
      throw new Error(`${where}（${item.title}）的 year 必须是整数`);
    }
    if (typeof item.venue !== 'string' || !item.venue.trim()) {
      throw new Error(`${where}（${item.title}）缺少 venue 或字段非法`);
    }
    if (typeof item.id !== 'string' || !item.id.trim()) {
      throw new Error(`${where}（${item.title}）缺少 id`);
    }
    if (seen.has(item.id)) {
      throw new Error(`${where}（${item.title}）的 id 重复：${item.id}`);
    }
    seen.add(item.id);
    if (
      item.type !== undefined &&
      !(PUBLICATION_TYPES as readonly string[]).includes(String(item.type))
    ) {
      throw new Error(
        `${where}（${item.title}）的 type 必须是 ${PUBLICATION_TYPES.join('/')} 之一，当前为：${String(item.type)}`
      );
    }
  }
}

/** 写回 publications.yaml：校验 → 快照 → dump → 撤销链（同 configs.ts 保存链路） */
export function writePublications(dataDir: string, cfg: PublicationsData): void {
  validatePublications(cfg);
  createSnapshot(dataDir, 'publications.yaml'); // 文件不存在时返回 null，直接新建
  writeFileSync(path.join(dataDir, 'publications.yaml'), dumpYaml(cfg), 'utf8');
  notifyWrite(dataDir, 'publications.yaml');
}
