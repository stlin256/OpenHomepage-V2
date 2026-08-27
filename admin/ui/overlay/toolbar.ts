/**
 * 浮动工具条（M12b，docs/specs/12 §2.4/§3）：hover 块时在块上方浮出
 * 编辑/上移/下移/删除/下方插入；fixed 定位，滚动/缩放时重锚定。
 * 纯 DOM 组件：可用性由 computeToolbarState 推导（服务端口径同父兄弟块），
 * 具体操作经回调交给 main（runOp → 块级 API → 成功后整页刷新）。
 * M12c：指令块（除 cell）的「编辑」启用——语义为打开右侧检查器（参数面板），
 * 由 main 分流；cell 无参数，保持禁用。
 */
import { el } from '../dom.ts';
import type { BlockEntry, ServerBlock } from './scanner.ts';

/** 纯文本类块（非指令）才允许就地微编辑；无服务端数据（hash 缺失）一律不可操作 */
export function isTextEditable(entry: BlockEntry): boolean {
  return !!entry.hash && entry.kind !== 'containerDirective' && entry.kind !== 'leafDirective';
}

/** 指令块（除 cell）启用「编辑」= 打开右侧检查器（M12c）；无服务端数据一律不可操作 */
export function isInspectable(entry: BlockEntry): boolean {
  return (
    !!entry.hash &&
    (entry.kind === 'containerDirective' || entry.kind === 'leafDirective') &&
    entry.name !== 'cell'
  );
}

export interface ToolbarState {
  /** 编辑入口可用：文本块 → 微编辑器；指令块（除 cell）→ 右侧检查器（M12c，分流在 main） */
  canEdit: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canDelete: boolean;
  canInsert: boolean;
  /** move 的 to 目标：上移 = 前一兄弟块 start，下移 = 后一兄弟块 end（服务端归一化为行边界） */
  moveUpTo?: number;
  moveDownTo?: number;
}

/**
 * 由「服务端口径同父兄弟块（源码序，含自身）」推导工具条可用性与移动目标。
 * 兄弟列表取服务端数据而非 DOM 注册表：html 原文块无 DOM 但占兄弟位，
 * 移动目标用其坐标依然合法（服务端按边界归一化）。
 */
export function computeToolbarState(entry: BlockEntry, siblings: ServerBlock[]): ToolbarState {
  const idx = siblings.findIndex(
    (b) => b.start === entry.span.start && b.end === entry.span.end
  );
  const prev = idx > 0 ? siblings[idx - 1] : undefined;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : undefined;
  return {
    canEdit: isTextEditable(entry) || isInspectable(entry),
    canMoveUp: !!entry.hash && !!prev,
    canMoveDown: !!entry.hash && !!next,
    canDelete: !!entry.hash,
    canInsert: !!entry.hash,
    moveUpTo: prev?.start,
    moveDownTo: next?.end,
  };
}

export interface ToolbarDeps {
  t: (k: string) => string;
  /** 同父兄弟块（服务端口径，源码序，含自身） */
  siblingsOf: (entry: BlockEntry) => ServerBlock[];
  onEdit: (entry: BlockEntry) => void;
  onMove: (entry: BlockEntry, to: number) => void;
  onDelete: (entry: BlockEntry) => void;
  onInsertBelow: (entry: BlockEntry) => void;
}

export interface Toolbar {
  el: HTMLElement;
  /** 锚定到指定块并显示（刷新按钮可用性；重复调用即重锚定） */
  showFor(entry: BlockEntry): void;
  hide(): void;
  current(): BlockEntry | null;
}

/** 顶栏高度（overlay.css 的 .oh-topbar），工具条不压顶栏 */
const TOPBAR_H = 40;

export function createToolbar(doc: Document, deps: ToolbarDeps): Toolbar {
  const { t } = deps;
  let current: BlockEntry | null = null;

  const editBtn = el('button', { type: 'button' }, t('edit')) as HTMLButtonElement;
  const upBtn = el('button', { type: 'button' }, t('moveUp')) as HTMLButtonElement;
  const downBtn = el('button', { type: 'button' }, t('moveDown')) as HTMLButtonElement;
  const delBtn = el('button', { type: 'button', class: 'oh-danger' }, t('remove')) as HTMLButtonElement;
  const insBtn = el('button', { type: 'button' }, t('insertBelow')) as HTMLButtonElement;
  const bar = el(
    'div',
    { class: 'oh-toolbar', role: 'toolbar', 'aria-label': t('actions') },
    editBtn,
    upBtn,
    downBtn,
    delBtn,
    insBtn
  );
  bar.hidden = true;
  doc.body.append(bar);

  const stateFor = (entry: BlockEntry): ToolbarState =>
    computeToolbarState(entry, deps.siblingsOf(entry));

  editBtn.addEventListener('click', () => {
    if (current) deps.onEdit(current);
  });
  upBtn.addEventListener('click', () => {
    if (!current) return;
    const s = stateFor(current);
    if (s.moveUpTo !== undefined) deps.onMove(current, s.moveUpTo);
  });
  downBtn.addEventListener('click', () => {
    if (!current) return;
    const s = stateFor(current);
    if (s.moveDownTo !== undefined) deps.onMove(current, s.moveDownTo);
  });
  delBtn.addEventListener('click', () => {
    if (current) deps.onDelete(current);
  });
  insBtn.addEventListener('click', () => {
    if (current) deps.onInsertBelow(current);
  });

  /** 按块位置重锚定：优先块上方，放不下（会压顶栏）则放块下方 */
  const anchor = (): void => {
    if (!current) return;
    const rect = current.el.getBoundingClientRect();
    const h = bar.offsetHeight || 32;
    const above = rect.top - h - 6;
    const below = rect.bottom + 6;
    bar.style.top = `${above >= TOPBAR_H + 4 ? above : below}px`;
    bar.style.left = `${Math.max(4, rect.left)}px`;
  };
  const reanchor = (): void => anchor();
  const win = doc.defaultView;

  const showFor = (entry: BlockEntry): void => {
    current = entry;
    const s = stateFor(entry);
    editBtn.disabled = !s.canEdit;
    editBtn.title = s.canEdit ? '' : t('editUnsupported');
    upBtn.disabled = !s.canMoveUp;
    downBtn.disabled = !s.canMoveDown;
    delBtn.disabled = !s.canDelete;
    insBtn.disabled = !s.canInsert;
    if (bar.hidden) {
      bar.hidden = false;
      win?.addEventListener('scroll', reanchor, true);
      win?.addEventListener('resize', reanchor);
    }
    anchor();
  };
  const hide = (): void => {
    current = null;
    if (bar.hidden) return;
    bar.hidden = true;
    win?.removeEventListener('scroll', reanchor, true);
    win?.removeEventListener('resize', reanchor);
  };

  return { el: bar, showFor, hide, current: () => current };
}
