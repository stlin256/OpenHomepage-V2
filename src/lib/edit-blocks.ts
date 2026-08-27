/**
 * 可视化编辑的源码块坐标层（M12a，docs/specs/12 §2.2/§2.5）。
 *
 * listEditableBlocks：用与渲染管线相同的解析器（remark-parse + GFM + directive + math）
 * 枚举正文 body（不含 frontmatter）中的可编辑块——mdast 顶层子节点，以及 grid/cell
 * 容器指令内部的块（递归；嵌套 grid 遵循「外层冒号数多于内层」规则，同理递归）。
 * 坐标为 body 字符串的 offset 偏移（不含行尾换行）。remarkEditSpans
 * （src/lib/markdown.ts）与 admin 块级 API（admin/server/blocks.ts）共用本函数，
 * 保证「渲染页 data-oh-src ↔ 服务端校验」坐标一致。
 *
 * 块拼接（replaceBlock/insertBlock/deleteBlock/moveBlock）：按偏移操作 body 字符串的
 * 纯函数。一律以「整行」为粒度（块 offset 经 blockLineSpan 扩展为含行尾换行的行区间），
 * 插入/移动时按需要补齐块间空行，保证结果可被同一解析器稳定重解析。
 * 约定：传入的 body 以换行结尾或为空（admin 侧读取时已归一化）。
 *
 * M12c 增补：指令属性段工具——serializeAttrs（属性表 → `{key="v"}`，实体编码与
 * mdast-util-directive 解析严格往返）、rewriteDirectiveAttrs（只重写指令块起始行的
 * 属性段，容器内容不动）、containerCloseLineStart（容器闭围栏行首，into 插入点）。
 *
 * 拖拽跨容器移动增补：moveBlockCrossContainer（落点集合 legalMoveBoundaries =
 * 全部块行首/行尾边界 + grid/cell 容器闭围栏行首；围栏冒号冲突按「改动最小」
 * 重归一化——优先提升祖先链，可缩减时缩减被移动内容外层）、
 * assertMoveStructurePreserved（移动前后指令节点数守恒、纯冒号残留段落不新增）。
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';
import remarkMath from 'remark-math';
import type { Root, RootContent } from 'mdast';
import type { ContainerDirective } from 'mdast-util-directive';

export interface EditableBlock {
  /** 块在 body 中的起始 offset（含） */
  start: number;
  /** 结束 offset（不含，即块最后一个字符之后） */
  end: number;
  /** mdast 节点类型：paragraph/heading/list/code/html/containerDirective/leafDirective/... */
  kind: string;
  /** 指令名（kind 为 containerDirective/leafDirective 时存在，如 grid/cell/stream） */
  name?: string;
  /** 指令属性表（kind 为指令时存在；无属性段为 {}。M12c：检查器表单初值，免前端再解析） */
  attrs?: Record<string, string>;
  /** 父容器标识：顶层块为 'root'，grid/cell 内部块为父块的 `${start}:${end}` */
  parent: string;
}

/** 其内部块需要递归枚举的容器指令（其他容器如 figure 内部不单独枚举） */
const GRID_CONTAINERS = new Set(['grid', 'cell']);

/** 内容可编辑（内部块递归枚举）的容器指令名集合（M12c 检查器 into 插入校验复用） */
export const EDITABLE_CONTAINERS: ReadonlySet<string> = GRID_CONTAINERS;

/** 与渲染管线同口径的 mdast 解析（纯语法树，不做自定义指令映射） */
export function parseBody(body: string): Root {
  return unified().use(remarkParse).use(remarkGfm).use(remarkDirective).use(remarkMath).parse(body);
}

/** 枚举 body 中的可编辑块（顶层 + grid/cell 容器内部递归），按源码顺序返回 */
export function listEditableBlocks(body: string): EditableBlock[] {
  const blocks: EditableBlock[] = [];
  const walk = (children: readonly RootContent[], parent: string): void => {
    for (const node of children) {
      const pos = node.position;
      if (!pos || pos.start.offset === undefined || pos.end.offset === undefined) continue;
      const block: EditableBlock = {
        start: pos.start.offset,
        end: pos.end.offset,
        kind: node.type,
        parent,
      };
      if (node.type === 'containerDirective' || node.type === 'leafDirective') {
        block.name = node.name;
        // mdast-util-directive 的 attributes：无属性段为 undefined；裸键（{flag}）值为 ''
        const attrs: Record<string, string> = {};
        for (const [k, v] of Object.entries(node.attributes ?? {})) {
          if (typeof v === 'string') attrs[k] = v;
        }
        block.attrs = attrs;
      }
      blocks.push(block);
      if (node.type === 'containerDirective' && GRID_CONTAINERS.has(node.name)) {
        walk(node.children, `${block.start}:${block.end}`);
      }
    }
  };
  walk(parseBody(body).children, 'root');
  return blocks;
}

/**
 * 块 offset → 整行区间 [行首, 下一行行首)（含块末换行；EOF 无换行则为 body.length）。
 * 块起点前/终点后同行只允许空白字符，否则视为非法块坐标（防截断同行内容）。
 */
export function blockLineSpan(body: string, start: number, end: number): [number, number] {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > body.length) {
    throw new Error(`非法的块坐标：${start},${end}`);
  }
  const ls = start === 0 ? 0 : body.lastIndexOf('\n', start - 1) + 1;
  if (body.slice(ls, start).trim() !== '') {
    throw new Error(`非法的块坐标：${start},${end}（起点不在行首）`);
  }
  const nl = body.indexOf('\n', end);
  const lineEnd = nl === -1 ? body.length : nl;
  if (body.slice(end, lineEnd).trim() !== '') {
    throw new Error(`非法的块坐标：${start},${end}（终点不在行尾）`);
  }
  return [ls, nl === -1 ? body.length : nl + 1];
}

/** 片段归一化：去掉首尾空白（拼接时自行控制换行与空行） */
function normalizeSnippet(markdown: string): string {
  return markdown.replace(/^\s+/, '').replace(/\s+$/, '');
}

/** 在行首边界 at 处插入片段，按需要补齐两侧空行（避免与相邻块粘连合块） */
function spliceAtLine(body: string, at: number, markdown: string): string {
  if (!Number.isInteger(at) || at < 0 || at > body.length || (at > 0 && body[at - 1] !== '\n')) {
    throw new Error(`插入点必须是行首边界：${at}`);
  }
  const md = normalizeSnippet(markdown);
  if (!md) throw new Error('缺少插入内容（markdown 不能为空）');
  // 前一行不是空行时补空行（段落/列表等无空行会与上一块合并）
  const pre = at > 0 && (at < 2 || body[at - 2] !== '\n') ? '\n' : '';
  // 后一行不是空行/EOF 时补空行
  const post = at < body.length && body[at] !== '\n' ? '\n' : '';
  return `${body.slice(0, at)}${pre}${md}\n${post}${body.slice(at)}`;
}

/** 用 markdown 替换 [start, end) 处的块（保持整行结构） */
export function replaceBlock(body: string, start: number, end: number, markdown: string): string {
  const md = normalizeSnippet(markdown);
  if (!md) throw new Error('缺少替换内容（markdown 不能为空）');
  const [ls, ee] = blockLineSpan(body, start, end);
  return `${body.slice(0, ls)}${md}\n${body.slice(ee)}`;
}

/** 删除 [start, end) 处的块；顺带收走一个相邻空行，避免删除处留下双空行 */
export function deleteBlock(body: string, start: number, end: number): string {
  const [ls, ee] = blockLineSpan(body, start, end);
  // 优先收走块后的空行；块在文末且前面有空行时改收前面的
  if (ee < body.length && body[ee] === '\n') return body.slice(0, ls) + body.slice(ee + 1);
  if (ee === body.length && ls >= 2 && body[ls - 2] === '\n') return body.slice(0, ls - 1);
  return body.slice(0, ls) + body.slice(ee);
}

/** 在行首边界 at 处插入新块（at 取某块的行首/行尾边界，即「插到该块前/后」） */
export function insertBlock(body: string, at: number, markdown: string): string {
  return spliceAtLine(body, at, markdown);
}

/**
 * 把 [start, end) 处的块移动到行首边界 to（to 取同容器兄弟块的行首/行尾边界）。
 * 移到自身边界为空操作；to 落在块内部为非法。同容器约束由调用方（块级 API）校验。
 */
export function moveBlock(body: string, start: number, end: number, to: number): string {
  const [ls, ee] = blockLineSpan(body, start, end);
  if (to === ls || to === ee) return body;
  if (to > ls && to < ee) throw new Error(`移动目标非法（落在被移动块内部）：${to}`);
  const cut = body.slice(ls, ee); // 含行尾换行
  // 与 deleteBlock 相同的空行收走规则，保证移除后的偏移可预测
  let rest: string;
  let removed = ee - ls;
  if (ee < body.length && body[ee] === '\n') {
    rest = body.slice(0, ls) + body.slice(ee + 1);
    removed += 1;
  } else if (ee === body.length && ls >= 2 && body[ls - 2] === '\n') {
    rest = body.slice(0, ls - 1);
    removed += 1;
  } else {
    rest = body.slice(0, ls) + body.slice(ee);
  }
  const at = to > ls ? to - removed : to;
  return spliceAtLine(rest, at, cut);
}

// ---------------------------------------------------------------------------
// 指令属性段（M12c，docs/specs/12 §3）：序列化与起始行重写
// ---------------------------------------------------------------------------

/**
 * 属性值编码：& " 与换行编码为 HTML 实体。
 * 与 mdast-util-directive 的解析严格往返：解析端对属性值做实体解码
 * （parseEntities），且不支持反斜杠转义——故反斜杠原样输出即可，双引号只能
 * 走实体（\" 会让解析提前收尾导致整条指令降级）。与 remark-directive 的
 * stringifier 同策略（stringifyEntitiesLight）。
 */
function encodeAttrValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '&#xA;')
    .replace(/\r/g, '&#xD;');
}

/**
 * 属性表 → 指令属性段文本：{key="v" key2="v2"}；空表 → 空串。
 * 键原样输出（合法性由调用方校验）；值一律双引号包裹并实体编码。
 */
export function serializeAttrs(attrs: Record<string, string>): string {
  const parts = Object.entries(attrs).map(([k, v]) => `${k}="${encodeAttrValue(v)}"`);
  return parts.length > 0 ? `{${parts.join(' ')}}` : '';
}

/** 指令块起始行的头部：开围栏冒号 + 指令名（指令名规则同 micromark factoryName） */
const DIRECTIVE_HEAD_RE = /^(:{2,})([A-Za-z0-9_-]*)/;

/**
 * 重写 [start, end) 处指令块**起始行**的属性段（{...}），保留指令名、围栏冒号数、
 * label 与容器内容不动（grid 改列数不碰 cell；叶/空容器指令效果等同整行替换）。
 * - 已有属性段：定位指令名（及可选 label）后的首个 {，引号感知配对 }（值内可含 }），
 *   整段替换为序列化结果；
 * - 无属性段：attrs 非空时在指令名/label 后插入；attrs 为空则原样返回；
 * - attrs 为空表：移除属性段。
 * 前置条件由调用方保证：[start,end) 是解析成功的指令块（属性段必在开围栏行，spec 03；
 * 属性段非法的指令会被解析器降级为普通段落，走不到这里）。
 */
export function rewriteDirectiveAttrs(
  body: string,
  start: number,
  end: number,
  attrs: Record<string, string>
): string {
  const nl = body.indexOf('\n', start);
  const lineEnd = nl === -1 || nl > end ? end : nl;
  const line = body.slice(start, lineEnd);
  const head = DIRECTIVE_HEAD_RE.exec(line);
  if (!head) throw new Error(`非法的指令块起始行：${line}`);
  // 属性段起点：指令名（及可选 [label]）之后的首个 {
  let scanFrom = head[0].length;
  if (line[scanFrom] === '[') {
    const close = line.indexOf(']', scanFrom + 1);
    if (close !== -1) scanFrom = close + 1;
  }
  const open = line.indexOf('{', scanFrom);
  const attrText = serializeAttrs(attrs);
  let newLine: string;
  if (open === -1) {
    if (!attrText) return body; // 无属性段且目标为空：原样
    newLine = `${line.slice(0, scanFrom)}${attrText}${line.slice(scanFrom)}`;
  } else {
    // 引号感知配对 }：属性值内可含 }（如 caption="a}b"）
    let i = open + 1;
    let quote = '';
    for (; i < line.length; i++) {
      const c = line[i];
      if (quote) {
        if (c === quote) quote = '';
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '}') {
        break;
      }
    }
    if (i >= line.length) throw new Error(`属性段未闭合：${line}`);
    newLine = `${line.slice(0, open)}${attrText}${line.slice(i + 1)}`;
  }
  return `${body.slice(0, start)}${newLine}${body.slice(lineEnd)}`;
}

/**
 * 容器块闭围栏行的行首 offset（M12c：insert into 的插入点——插为容器最后一个子块）。
 * end 为块末 offset（闭围栏行尾，不含换行）；end-1 落在闭围栏行内，其行首即插入点。
 */
export function containerCloseLineStart(body: string, start: number, end: number): number {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > body.length) {
    throw new Error(`非法的块坐标：${start},${end}`);
  }
  return body.lastIndexOf('\n', end - 1) + 1; // 无换行时 -1+1=0（文首）
}

// ---------------------------------------------------------------------------
// 跨容器移动（块拖拽落地，docs/specs/12 §3 v2 项）：
// 合法落点集合、围栏冒号重归一化、移动前后结构守恒校验
// ---------------------------------------------------------------------------

/**
 * 可插入边界的完整集合（跨容器放开后的 move 落点）：
 * 全部可编辑块的行首/行尾边界（兄弟块之前/之后）+ grid/cell 容器闭围栏行首
 * （= 容器内末尾落点；空容器唯一的内部落点，非空容器该点与末子块行尾边界重合）。
 * 键接受块的原始 start/end 与归一化行边界，值一律为归一化行首 offset。
 * 注意边界语义由 offset 唯一确定：某行行首落在哪个容器内部由解析树决定，
 * 闭围栏行首是「容器内」，闭围栏之后才是「容器外」。
 */
export function legalMoveBoundaries(body: string): Map<number, number> {
  const map = new Map<number, number>();
  for (const b of listEditableBlocks(body)) {
    const [ls, ee] = blockLineSpan(body, b.start, b.end);
    map.set(b.start, ls);
    map.set(b.end, ee);
    map.set(ls, ls);
    map.set(ee, ee);
    if (b.kind === 'containerDirective' && EDITABLE_CONTAINERS.has(b.name ?? '')) {
      const close = containerCloseLineStart(body, b.start, b.end);
      map.set(close, close);
    }
  }
  return map;
}

/** 围栏冒号段：首个冒号的 offset 与连续冒号数 */
interface FenceRun {
  offset: number;
  count: number;
}

/**
 * 容器指令的开/闭围栏冒号段。开围栏取 position.start 起的冒号串；
 * 闭围栏在块末所在行（允许前导空白，spec 容错范围内）。
 */
function containerFenceRuns(body: string, node: ContainerDirective): { open: FenceRun; close: FenceRun } {
  const openOffset = node.position?.start.offset;
  const endOffset = node.position?.end.offset;
  if (openOffset === undefined || endOffset === undefined) {
    throw new Error('容器指令缺少位置信息');
  }
  let openCount = 0;
  while (body[openOffset + openCount] === ':') openCount++;
  const closeLineStart = body.lastIndexOf('\n', endOffset - 1) + 1;
  let closeOffset = closeLineStart;
  while (body[closeOffset] === ' ' || body[closeOffset] === '\t') closeOffset++;
  let closeCount = 0;
  while (body[closeOffset + closeCount] === ':') closeCount++;
  return { open: { offset: openOffset, count: openCount }, close: { offset: closeOffset, count: closeCount } };
}

/** 在解析树中按坐标精确查找块节点（坐标来自同一份 body 的解析，必能命中；容器内递归） */
function findBlockNode(root: Root, start: number, end: number): RootContent | null {
  let found: RootContent | null = null;
  const walk = (children: readonly RootContent[]): void => {
    for (const node of children) {
      if (found) return;
      const s = node.position?.start.offset;
      const e = node.position?.end.offset;
      if (s === start && e === end) {
        found = node;
        return;
      }
      if (node.type === 'containerDirective') walk((node as ContainerDirective).children);
    }
  };
  walk(root.children);
  return found;
}

/** 包含指定 offset 的容器指令链（外层在前；offset 恰落在容器起/止边界上不算其内部） */
function ancestorContainers(root: Root, at: number): ContainerDirective[] {
  const chain: ContainerDirective[] = [];
  const walk = (children: readonly RootContent[]): void => {
    for (const node of children) {
      if (node.type !== 'containerDirective') continue;
      const s = node.position?.start.offset;
      const e = node.position?.end.offset;
      if (s === undefined || e === undefined || !(s < at && at < e)) continue;
      chain.push(node as ContainerDirective);
      walk((node as ContainerDirective).children);
    }
  };
  walk(root.children);
  return chain;
}

/** 被移动容器内部（任意深度）容器指令的围栏冒号最大值（无内部容器为 0；取全深度偏保守，合法内容下同直接子级） */
function maxInnerFence(body: string, node: ContainerDirective): number {
  let max = 0;
  const walk = (children: readonly RootContent[]): void => {
    for (const child of children) {
      if (child.type !== 'containerDirective') continue;
      max = Math.max(max, containerFenceRuns(body, child as ContainerDirective).open.count);
      walk((child as ContainerDirective).children);
    }
  };
  walk(node.children);
  return max;
}

/** 重归一化方案：bump = 各祖先容器的新围栏数（外层在前，不变则同原值）；shrinkTo = 被移动容器外层新围栏数（null = 不缩减） */
interface FencePlan {
  bump: number[];
  shrinkTo: number | null;
}

/**
 * 围栏冲突（被移动内容外层冒号数 ≥ 插入点最内层祖先，违反 spec 03「外层多于内层」）时的
 * 最小改动方案：
 * - 提升祖先链（恒可行）：最内层提升到 被移动外层+1，再自内向外级联保持严格递增，
 *   只改祖先的开/闭围栏行（局部编辑）；
 * - 缩减被移动内容外层（改 2 行）：目标值 = 最内层祖先 − 1，需 ≥3 且仍大于其内部容器
 *   围栏（有富余才可缩）；
 * 改动行数更少者胜；相同（提升仅涉及 1 个祖先）时按既定偏好取提升祖先链。
 */
function planFenceRenorm(movedCount: number, movedMaxInner: number, ancestorCounts: number[]): FencePlan | null {
  const innermost = ancestorCounts[ancestorCounts.length - 1];
  if (movedCount < innermost) return null; // 无冲突
  const bump = [...ancestorCounts];
  bump[bump.length - 1] = movedCount + 1;
  for (let i = bump.length - 2; i >= 0; i--) {
    bump[i] = Math.max(bump[i], bump[i + 1] + 1);
  }
  const bumpedContainers = bump.filter((v, i) => v !== ancestorCounts[i]).length;
  const shrinkTo = innermost - 1;
  if (shrinkTo >= 3 && shrinkTo > movedMaxInner && bumpedContainers >= 2) {
    return { bump: ancestorCounts, shrinkTo };
  }
  return { bump, shrinkTo: null };
}

/** 批量重写围栏冒号数：自底向上应用（前序修改不位移后续 offset）；只改冒号串本身，行内其余内容不动 */
function applyFenceEdits(
  text: string,
  edits: readonly { offset: number; oldCount: number; newCount: number }[]
): string {
  let out = text;
  const sorted = [...edits].sort((a, b) => b.offset - a.offset);
  for (const e of sorted) {
    if (e.newCount === e.oldCount) continue;
    if (out.slice(e.offset, e.offset + e.oldCount) !== ':'.repeat(e.oldCount)) {
      throw new Error(`围栏定位失败：${e.offset}`);
    }
    out = out.slice(0, e.offset) + ':'.repeat(e.newCount) + out.slice(e.offset + e.oldCount);
  }
  return out;
}

/**
 * 把 [start, end) 处的块移动到插入边界 to（跨容器放开版 move，拖拽落点走这里）：
 * - to 取 legalMoveBoundaries 的任一坐标（任意兄弟块之前/之后、grid/cell 容器内末尾——
 *   含空容器唯一内部落点）；移到自身边界为空操作；落在被移动块内部抛错；
 * - 被移动内容是容器指令且与插入点祖先链发生围栏冲突时按 planFenceRenorm 重归一化；
 *   被移动容器内部的相对嵌套关系不变，移到顶层（无祖先）不做无谓缩减；
 * - cell 移出 grid 到顶层不作限制（渲染上退化为普通 div，交给用户）。
 * 调用方（块级 API）负责随后的 assertMoveStructurePreserved 结构守恒校验与落盘。
 */
export function moveBlockCrossContainer(body: string, start: number, end: number, to: number): string {
  const [ls, ee] = blockLineSpan(body, start, end);
  const atRaw = legalMoveBoundaries(body).get(to);
  if (atRaw === undefined) throw new Error(`move 的 to 必须落在可插入的块边界上：${to}`);
  if (atRaw === ls || atRaw === ee) return body; // 自身边界：空操作
  if (atRaw > ls && atRaw < ee) throw new Error(`移动目标非法（落在被移动块内部）：${to}`);

  // 被移动内容的围栏信息（仅容器指令有）与插入点祖先链（外层在前），均在原文坐标系计算
  const root = parseBody(body);
  const movedNode = findBlockNode(root, start, end);
  const movedRuns =
    movedNode?.type === 'containerDirective'
      ? containerFenceRuns(body, movedNode as ContainerDirective)
      : null;
  const ancestors = ancestorContainers(root, atRaw).map((node) => ({
    runs: containerFenceRuns(body, node),
  }));
  const plan = movedRuns
    ? planFenceRenorm(
        movedRuns.open.count,
        maxInnerFence(body, movedNode as ContainerDirective),
        ancestors.map((a) => a.runs.open.count)
      )
    : null;

  // 剪除被移动块（与 moveBlock 相同的空行收走规则，保证移除后偏移可预测）
  const cut = body.slice(ls, ee); // 含行尾换行
  let rest: string;
  let removed = ee - ls;
  if (ee < body.length && body[ee] === '\n') {
    rest = body.slice(0, ls) + body.slice(ee + 1);
    removed += 1;
  } else if (ee === body.length && ls >= 2 && body[ls - 2] === '\n') {
    rest = body.slice(0, ls - 1);
    removed += 1;
  } else {
    rest = body.slice(0, ls) + body.slice(ee);
  }
  // 原文 offset → rest 坐标系（被剪区域之后的内容前移 removed）
  const adjust = (o: number): number => (o > ls ? o - removed : o);
  let at = adjust(atRaw);

  // 被移动内容外层围栏缩减（相对坐标改片段两行围栏；内部相对嵌套不变）
  let snippet = cut;
  if (plan?.shrinkTo != null && movedRuns) {
    snippet = applyFenceEdits(cut, [
      { offset: movedRuns.open.offset - ls, oldCount: movedRuns.open.count, newCount: plan.shrinkTo },
      { offset: movedRuns.close.offset - ls, oldCount: movedRuns.close.count, newCount: plan.shrinkTo },
    ]);
  }

  // 祖先链围栏提升（rest 坐标系；只改各容器的开/闭围栏行）
  if (plan) {
    const edits: { offset: number; oldCount: number; newCount: number }[] = [];
    for (let i = 0; i < ancestors.length; i++) {
      if (plan.bump[i] === ancestors[i].runs.open.count) continue;
      edits.push({
        offset: adjust(ancestors[i].runs.open.offset),
        oldCount: ancestors[i].runs.open.count,
        newCount: plan.bump[i],
      });
      edits.push({
        offset: adjust(ancestors[i].runs.close.offset),
        oldCount: ancestors[i].runs.close.count,
        newCount: plan.bump[i],
      });
    }
    // 插入点所在行之前的修改会位移插入点（行内增减冒号，行首边界性质不变）
    const delta = edits.filter((e) => e.offset < at).reduce((sum, e) => sum + e.newCount - e.oldCount, 0);
    rest = applyFenceEdits(rest, edits);
    at += delta;
  }

  return spliceAtLine(rest, at, snippet);
}

/** 结构计数：指令节点总数 + 纯冒号残留围栏段落数（spec 03 §2 的容错移除对象） */
function structureCounts(root: Root): { directives: number; strayFences: number } {
  let directives = 0;
  let strayFences = 0;
  const walk = (node: Root | RootContent): void => {
    if (
      node.type === 'containerDirective' ||
      node.type === 'leafDirective' ||
      node.type === 'textDirective'
    ) {
      directives++;
    } else if (node.type === 'paragraph') {
      const children = node.children;
      const only = children.length === 1 ? children[0] : null;
      if (only?.type === 'text' && /^:{3,}$/.test(only.value.trim())) strayFences++;
    }
    for (const c of (node as { children?: RootContent[] }).children ?? []) walk(c);
  };
  walk(root);
  return { directives, strayFences };
}

/**
 * 移动前后的结构守恒校验（move 落盘前的最后防线）：指令节点总数必须不变、
 * 纯冒号残留围栏段落不得新增。违反即拼接结果破坏了指令结构
 * （如围栏重归一化遗漏导致指令降级/闭合错位），调用方拒绝落盘。
 */
export function assertMoveStructurePreserved(before: string, after: string): void {
  const b = structureCounts(parseBody(before));
  const a = structureCounts(parseBody(after));
  if (a.directives !== b.directives) {
    throw new Error(`移动后指令节点数发生变化（${b.directives} → ${a.directives}），疑似围栏被破坏，未写盘`);
  }
  if (a.strayFences > b.strayFences) {
    throw new Error(`移动产生了新的冒号围栏残留段落（${b.strayFences} → ${a.strayFences}），未写盘`);
  }
}
