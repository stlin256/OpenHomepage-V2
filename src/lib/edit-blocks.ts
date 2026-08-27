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
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';
import remarkMath from 'remark-math';
import type { Root, RootContent } from 'mdast';

export interface EditableBlock {
  /** 块在 body 中的起始 offset（含） */
  start: number;
  /** 结束 offset（不含，即块最后一个字符之后） */
  end: number;
  /** mdast 节点类型：paragraph/heading/list/code/html/containerDirective/leafDirective/... */
  kind: string;
  /** 指令名（kind 为 containerDirective/leafDirective 时存在，如 grid/cell/stream） */
  name?: string;
  /** 父容器标识：顶层块为 'root'，grid/cell 内部块为父块的 `${start}:${end}` */
  parent: string;
}

/** 其内部块需要递归枚举的容器指令（其他容器如 figure 内部不单独枚举） */
const GRID_CONTAINERS = new Set(['grid', 'cell']);

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
