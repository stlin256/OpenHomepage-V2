/**
 * overlay 块注册表（M12a，docs/specs/12 §2.4）：扫描渲染页中的 [data-oh-src] 元素，
 * 解析源码坐标（格式：<data/相对路径>:<start>,<end>，由 remarkEditSpans 注入），
 * 建立「元素 ↔ 坐标」映射。hover 高亮与工具条锚定都基于该注册表。
 * M12b：mergeServerBlocks 把服务端块数据（hash/kind/parent/原文切片）按 (start,end)
 * 合并进注册表（DOM 坐标 ↔ 服务端块对齐），工具条/微编辑器据此工作。
 * M12d：data-oh-cfg（yaml 字段坐标 <path>@<lang>，就地改字）与
 * data-oh-cfg-block（首页配置区块坐标，检查器原生表单）的扫描；
 * resolveHitTarget 统一点击/hover 命中最内层坐标（cfg 字段 > markdown 块 > cfg-block）。
 */

export interface SourceSpan {
  /** data/ 相对路径，如 pages/zh/index.md */
  source: string;
  /** 块起始 offset（含，body 相对） */
  start: number;
  /** 块结束 offset（不含） */
  end: number;
}

/** 服务端块信息（GET /api/page/blocks 响应元素，与 admin/server/blocks.ts BlockInfo 对应） */
export interface ServerBlock {
  start: number;
  end: number;
  kind: string;
  name?: string;
  parent: string;
  /** 内容切片 sha1（防陈旧写） */
  hash: string;
  /** 块原文切片（微编辑器初值） */
  markdown: string;
  /** 指令属性表（kind 为指令时存在；M12c 检查器表单初值） */
  attrs?: Record<string, string>;
}

export interface BlockEntry {
  el: Element;
  span: SourceSpan;
  /** 以下为服务端块数据合并后填充（M12b）；未匹配到服务端块时保持 undefined（操作禁用） */
  kind?: string;
  name?: string;
  parent?: string;
  hash?: string;
  markdown?: string;
  /** 指令属性表（M12c：合并自服务端块，检查器表单初值） */
  attrs?: Record<string, string>;
}

const SPAN_RE = /^(.+):(\d+),(\d+)$/;

/** 解析 data-oh-src 属性值；非法格式返回 null */
export function parseOhSrc(value: string): SourceSpan | null {
  const m = SPAN_RE.exec(value.trim());
  if (!m) return null;
  return { source: m[1], start: Number(m[2]), end: Number(m[3]) };
}

/** 扫描 root 下所有带合法 data-oh-src 的元素（含 oh-embed 包裹的嵌入块），按文档顺序返回 */
export function scanBlocks(root: ParentNode): BlockEntry[] {
  const entries: BlockEntry[] = [];
  for (const el of Array.from(root.querySelectorAll('[data-oh-src]'))) {
    const span = parseOhSrc(el.getAttribute('data-oh-src') ?? '');
    if (span) entries.push({ el, span });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// M12d：配置字段坐标（data-oh-cfg）与首页配置区块坐标（data-oh-cfg-block）
// ---------------------------------------------------------------------------

/** yaml 字段坐标（<path>@<lang>；path 点分段，数组段按元素 id 匹配，见 shared/cfgpath.ts） */
export interface CfgFieldEntry {
  el: Element;
  /** yaml 路径，如 site.title / streaming_blocks.welcome.title */
  path: string;
  /** 内容语言（渲染该字段时使用的语言） */
  lang: string;
}

/** <path>@<lang>：path 至少一段；lang 取最后一个 @ 之后（路径本身不含 @） */
const CFG_FIELD_RE = /^(.+)@([a-z0-9-]+)$/i;

/** 解析 data-oh-cfg 属性值；非法格式返回 null */
export function parseOhCfg(value: string): { path: string; lang: string } | null {
  const m = CFG_FIELD_RE.exec(value.trim());
  if (!m) return null;
  return { path: m[1], lang: m[2].toLowerCase() };
}

/** 扫描 root 下所有带合法 data-oh-cfg 的元素，按文档顺序返回 */
export function scanCfgFields(root: ParentNode): CfgFieldEntry[] {
  const entries: CfgFieldEntry[] = [];
  for (const el of Array.from(root.querySelectorAll('[data-oh-cfg]'))) {
    const parsed = parseOhCfg(el.getAttribute('data-oh-cfg') ?? '');
    if (parsed) entries.push({ el, ...parsed });
  }
  return entries;
}

/** 首页配置区块坐标（data-oh-cfg-block）：profile/github/rss 或 streaming:<id>/editorial:<id> */
export interface CfgBlockEntry {
  el: Element;
  kind: 'profile' | 'github' | 'rss' | 'streaming' | 'editorial';
  /** 块 id（kind 为 streaming/editorial 时必有） */
  id?: string;
}

const CFG_BLOCK_KINDS = new Set(['profile', 'github', 'rss', 'streaming', 'editorial']);
/** id 必填的区块种类（profile/github/rss 全站唯一，不需要 id） */
const CFG_BLOCK_ID_KINDS = new Set(['streaming', 'editorial']);

/** 解析 data-oh-cfg-block 属性值；非法格式（未知种类、id 缺失/多余）返回 null */
export function parseOhCfgBlock(value: string): Omit<CfgBlockEntry, 'el'> | null {
  const v = value.trim();
  const sep = v.indexOf(':');
  const kind = sep === -1 ? v : v.slice(0, sep);
  const id = sep === -1 ? undefined : v.slice(sep + 1);
  if (!CFG_BLOCK_KINDS.has(kind)) return null;
  if (CFG_BLOCK_ID_KINDS.has(kind)) {
    if (!id) return null;
    return { kind: kind as CfgBlockEntry['kind'], id };
  }
  if (id !== undefined) return null;
  return { kind: kind as CfgBlockEntry['kind'] };
}

/** 扫描 root 下所有带合法 data-oh-cfg-block 的元素，按文档顺序返回 */
export function scanCfgBlocks(root: ParentNode): CfgBlockEntry[] {
  const entries: CfgBlockEntry[] = [];
  for (const el of Array.from(root.querySelectorAll('[data-oh-cfg-block]'))) {
    const parsed = parseOhCfgBlock(el.getAttribute('data-oh-cfg-block') ?? '');
    if (parsed) entries.push({ el, ...parsed });
  }
  return entries;
}

/** 点击/hover 的命中目标：cfg 字段 > markdown 块 > cfg-block 区块（最内层优先，§3） */
export type HitTarget =
  | { type: 'cfg'; el: Element }
  | { type: 'cfgblock'; el: Element }
  | { type: 'src'; el: Element };

/** 从事件目标向上找最近的坐标元素（closest 天然最内层优先，三类坐标互斥分流） */
export function resolveHitTarget(target: Element): HitTarget | null {
  const hit = target.closest('[data-oh-cfg], [data-oh-cfg-block], [data-oh-src]');
  if (!hit) return null;
  if (hit.hasAttribute('data-oh-cfg')) return { type: 'cfg', el: hit };
  if (hit.hasAttribute('data-oh-cfg-block')) return { type: 'cfgblock', el: hit };
  return { type: 'src', el: hit };
}

/**
 * 把某文件的服务端块数据按 (start,end) 合并进注册表。
 * 对不上的双方各 console.warn 跳过：DOM 块无服务端对应（坐标陈旧），
 * 服务端块无 DOM 对应（如 html 原文块 raw 直出无元素可挂坐标，见 markdown.ts）。
 */
export function mergeServerBlocks(
  entries: BlockEntry[],
  source: string,
  blocks: ServerBlock[]
): void {
  const byPos = new Map(blocks.map((b) => [`${b.start}:${b.end}`, b]));
  const matched = new Set<string>();
  for (const entry of entries) {
    if (entry.span.source !== source) continue;
    const b = byPos.get(`${entry.span.start}:${entry.span.end}`);
    if (!b) {
      console.warn(`[overlay] DOM 块在服务端无对应块，跳过：${source}:${entry.span.start},${entry.span.end}`);
      continue;
    }
    entry.kind = b.kind;
    entry.name = b.name;
    entry.parent = b.parent;
    entry.hash = b.hash;
    entry.markdown = b.markdown;
    entry.attrs = b.attrs;
    matched.add(`${b.start}:${b.end}`);
  }
  for (const b of blocks) {
    if (!matched.has(`${b.start}:${b.end}`)) {
      console.warn(`[overlay] 服务端块无 DOM 对应（html 原文块等），跳过：${source}:${b.start},${b.end}`);
    }
  }
}
