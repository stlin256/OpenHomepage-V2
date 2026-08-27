/**
 * 块级编辑 API 的服务端逻辑（M12a，docs/specs/12 §2.5）：
 * - listPageBlocks：列出页面正文（去 frontmatter）的可编辑块，附内容切片 sha1，
 *   供 overlay/客户端做陈旧检测（hash 不一致即 409）；
 * - applyBlockOp：replace/insert/delete/move 单块操作——重解析校验坐标处块 hash、
 *   replace/insert 的 markdown 必须恰好解析为一个顶层块、move 目标限同一父容器内
 *   块边界（防跨容器结构破坏）；沿用现有设施：safeResolve 路径限制、写前校验、
 *   写前快照（.snapshots）。落盘保留 frontmatter 原文（正文是原文切片，按长度回推头部）。
 * 坐标枚举与渲染页 data-oh-src 共用 src/lib/edit-blocks.ts 的 listEditableBlocks。
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { safeResolve } from './paths.ts';
import { parsePage } from './pages.ts';
import { createSnapshot } from './snapshots.ts';
import {
  listEditableBlocks,
  parseBody,
  blockLineSpan,
  replaceBlock,
  insertBlock,
  deleteBlock,
  moveBlock,
  type EditableBlock,
} from '../../src/lib/edit-blocks.ts';

/** hash 冲突（客户端基于陈旧内容编辑）：HTTP 409，由 http.ts sendError 识别 */
export class HashConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HashConflictError';
  }
}

export interface BlockInfo extends EditableBlock {
  /** 内容切片 body.slice(start, end) 的 sha1（hex） */
  hash: string;
}

/** 块级 API 只接受 pages/<lang>/<file>.md 形状（先形状校验，再 safeResolve 限制在 data/ 内） */
const PAGE_REL_RE = /^pages\/[a-z][a-z0-9-]*\/[^/\\]+\.md$/i;

function pageAbs(dataDir: string, rel: string): string {
  if (!PAGE_REL_RE.test(rel)) throw new Error(`非法的页面路径：${rel}`);
  return safeResolve(dataDir, rel);
}

/**
 * 读取页面：frontmatter + 归一化正文（统一补 EOF 换行，不改任何既有 offset，拼接按整行操作）。
 * head 为 frontmatter 原文（含 --- 围栏），落盘时原样保留（不重排 YAML、不丢注释）。
 */
function readPageFile(abs: string): {
  head: string;
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const text = readFileSync(abs, 'utf8');
  const { frontmatter, body } = parsePage(text);
  return {
    head: text.slice(0, text.length - body.length),
    frontmatter,
    body: body === '' || body.endsWith('\n') ? body : `${body}\n`,
  };
}

function hashSlice(body: string, start: number, end: number): string {
  return createHash('sha1').update(body.slice(start, end)).digest('hex');
}

function withHashes(body: string): BlockInfo[] {
  return listEditableBlocks(body).map((b) => ({ ...b, hash: hashSlice(body, b.start, b.end) }));
}

/** GET /api/page/blocks：列出可编辑块（含 parent 容器标识与内容 hash） */
export function listPageBlocks(dataDir: string, rel: string): BlockInfo[] {
  const abs = pageAbs(dataDir, rel);
  if (!existsSync(abs)) throw new Error(`页面不存在：${rel}`);
  return withHashes(readPageFile(abs).body);
}

export interface BlockOpResult {
  ok: true;
  /** 操作后的最新块列表（坐标已平移），客户端可直接刷新注册表 */
  blocks: BlockInfo[];
}

const OPS = new Set(['replace', 'insert', 'delete', 'move']);

/** replace/insert 的内容校验：同一解析器必须恰好解析出一个顶层块（防一次写入多块破坏坐标假设） */
function assertSingleBlock(markdown: string): void {
  let count = -1;
  try {
    count = parseBody(markdown).children.length;
  } catch {
    count = -1;
  }
  if (count !== 1) {
    throw new Error(`markdown 必须恰好解析为一个块（当前${count < 0 ? '无法解析' : ` ${count} 个`}）`);
  }
}

/**
 * 收集 blocks 的可接受边界坐标 → 归一化整行边界（行首 offset）。
 * 客户端传块的原始 start/end 或整行边界均可（原始 start 通常即行首，end+换行即行尾）。
 */
function boundaryMap(body: string, blocks: EditableBlock[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const b of blocks) {
    const [ls, ee] = blockLineSpan(body, b.start, b.end);
    map.set(b.start, ls);
    map.set(b.end, ee);
    map.set(ls, ls);
    map.set(ee, ee);
  }
  return map;
}

/**
 * POST /api/page/block 主体：
 * `{ path, op: replace|insert|delete|move, start, end, hash, markdown?, to? }`
 * - replace/delete/move：(start,end) 必须精确命中某个可编辑块且 hash 一致（不一致 409）；
 * - insert：锚块语义（hash 校验同上，插到锚块之后）；start===end 时为边界插入
 *   （零宽坐标，必须是某块行首/行尾边界，免 hash，用于文首等无锚块位置）；
 * - move 的 to：同一父容器内兄弟块（含自身）的边界坐标。
 */
export function applyBlockOp(dataDir: string, payload: Record<string, unknown>): BlockOpResult {
  const rel = String(payload.path ?? '');
  const abs = pageAbs(dataDir, rel);
  if (!existsSync(abs)) throw new Error(`页面不存在：${rel}`);
  const op = String(payload.op ?? '');
  if (!OPS.has(op)) throw new Error(`非法的块操作：${op}（必须是 replace/insert/delete/move）`);
  const start = Number(payload.start);
  const end = Number(payload.end);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
    throw new Error(`非法的块坐标：${payload.start},${payload.end}`);
  }
  const hash = String(payload.hash ?? '');
  const markdown = typeof payload.markdown === 'string' ? payload.markdown : undefined;

  const { head, frontmatter, body } = readPageFile(abs);
  const blocks = listEditableBlocks(body);

  // 锚块定位与陈旧检测
  let anchor: EditableBlock | undefined;
  let insertAt: number | undefined;
  if (op === 'insert' && start === end) {
    const boundaries = boundaryMap(body, blocks);
    boundaries.set(0, 0); // 文首恒为合法插入点（空文档/首块之前）
    const at = boundaries.get(start);
    if (at === undefined) throw new Error(`插入点非法（必须是块边界行首）：${start}`);
    insertAt = at;
  } else {
    anchor = blocks.find((b) => b.start === start && b.end === end);
    if (!anchor) throw new Error(`坐标处不存在可编辑块：${start},${end}`);
    if (!hash) throw new Error('缺少内容 hash（防陈旧写校验必需）');
    if (hashSlice(body, start, end) !== hash) {
      throw new HashConflictError(`块内容已被修改（hash 不一致），请刷新后重试：${start},${end}`);
    }
  }

  if (op === 'replace' || op === 'insert') {
    if (markdown === undefined) throw new Error(`${op} 缺少 markdown 内容`);
    assertSingleBlock(markdown);
  }

  let newBody: string;
  switch (op) {
    case 'replace':
      newBody = replaceBlock(body, start, end, markdown!);
      break;
    case 'insert':
      newBody = insertBlock(body, insertAt ?? blockLineSpan(body, start, end)[1], markdown!);
      break;
    case 'delete':
      newBody = deleteBlock(body, start, end);
      break;
    case 'move': {
      const to = Number(payload.to);
      if (!Number.isInteger(to) || to < 0) throw new Error('move 缺少合法的 to 坐标');
      // 同容器约束：to 必须落在锚块同一父容器内兄弟块（含自身）的边界上
      const siblings = blocks.filter((b) => b.parent === anchor!.parent);
      const at = boundaryMap(body, siblings).get(to);
      if (at === undefined) {
        throw new Error(`move 的 to 必须落在同一父容器内的块边界上：${to}`);
      }
      newBody = moveBlock(body, start, end, at);
      break;
    }
    default:
      throw new Error(`非法的块操作：${op}`);
  }

  // 落盘前校验（与 writePage 同口径）：frontmatter title 必需；拼接结果必须可重解析
  if (typeof frontmatter.title !== 'string' || frontmatter.title.trim() === '') {
    throw new Error('页面 frontmatter 缺少必需字段 title，未写盘。');
  }
  parseBody(newBody);

  createSnapshot(dataDir, rel);
  writeFileSync(abs, head + newBody, 'utf8');
  return { ok: true, blocks: withHashes(newBody) };
}
