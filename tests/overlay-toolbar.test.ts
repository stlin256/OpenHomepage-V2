/**
 * 浮动工具条（admin/ui/overlay/toolbar.ts，M12b/M12c）jsdom 测试：
 * 按钮可用性逻辑（文本块/指令块（除 cell）编辑可用——后者为检查器语义，cell 禁编辑、
 * 首/末兄弟块禁上移/下移、无 hash 全禁）、点击回调（编辑/移动目标坐标/删除/下方插入）
 * 与 showFor/hide 显隐；拖拽手柄（⠿ draggable，事件绑定在 dnd.ts 另有测试）。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import {
  createToolbar,
  computeToolbarState,
  isTextEditable,
  isInspectable,
  bindHover,
  HOVER_CLASS,
  HOVER_CFG_CLASS,
  type ToolbarDeps,
  type Toolbar,
} from '../admin/ui/overlay/toolbar.ts';
import type { BlockEntry, ServerBlock } from '../admin/ui/overlay/scanner.ts';
import { createT } from '../admin/shared/i18n.ts';

const t = createT('zh');

function entry(start: number, end: number, extra: Partial<BlockEntry> = {}): BlockEntry {
  const el = document.createElement('p');
  el.setAttribute('data-oh-src', `pages/zh/index.md:${start},${end}`);
  document.body.append(el);
  return {
    el,
    span: { source: 'pages/zh/index.md', start, end },
    kind: 'paragraph',
    parent: 'root',
    hash: `h${start}`,
    markdown: 'x',
    ...extra,
  };
}

function sBlock(start: number, end: number, parent = 'root'): ServerBlock {
  return { start, end, kind: 'paragraph', parent, hash: `h${start}`, markdown: 'x' };
}

/** 三个 root 兄弟块（源码序） */
const SIBS: ServerBlock[] = [sBlock(0, 5), sBlock(7, 10), sBlock(12, 20)];

describe('computeToolbarState：按钮可用性', () => {
  it('指令块（除 cell）编辑启用（语义为打开检查器，M12c）；cell 禁编辑；其余操作不受影响', () => {
    const grid = entry(7, 10, { kind: 'containerDirective', name: 'grid' });
    const s = computeToolbarState(grid, SIBS);
    expect(s.canEdit).toBe(true);
    expect(s.canMoveUp).toBe(true);
    expect(s.canMoveDown).toBe(true);
    expect(s.canDelete).toBe(true);
    expect(s.canInsert).toBe(true);
    const leaf = entry(7, 10, { kind: 'leafDirective', name: 'stream' });
    expect(isTextEditable(leaf)).toBe(false); // 指令块不走微编辑器
    expect(isInspectable(leaf)).toBe(true);
    expect(isInspectable(grid)).toBe(true);
    // cell 无参数：编辑禁用
    const cell = entry(7, 10, { kind: 'containerDirective', name: 'cell' });
    expect(computeToolbarState(cell, SIBS).canEdit).toBe(false);
    expect(isInspectable(cell)).toBe(false);
    expect(isTextEditable(entry(7, 10))).toBe(true);
  });

  it('首块禁上移、末块禁下移；移动目标取兄弟块 start/end', () => {
    const first = computeToolbarState(entry(0, 5), SIBS);
    expect(first.canMoveUp).toBe(false);
    expect(first.moveUpTo).toBeUndefined();
    expect(first.canMoveDown).toBe(true);
    expect(first.moveDownTo).toBe(10); // 下一块 end
    const mid = computeToolbarState(entry(7, 10), SIBS);
    expect(mid.moveUpTo).toBe(0); // 上一块 start
    expect(mid.moveDownTo).toBe(20);
    const last = computeToolbarState(entry(12, 20), SIBS);
    expect(last.canMoveDown).toBe(false);
    expect(last.moveDownTo).toBeUndefined();
  });

  it('无服务端数据（hash 缺失）全部禁用', () => {
    const orphan = entry(7, 10, { hash: undefined, kind: undefined, parent: undefined });
    const s = computeToolbarState(orphan, SIBS);
    expect(s).toMatchObject({
      canEdit: false,
      canMoveUp: false,
      canMoveDown: false,
      canDelete: false,
      canInsert: false,
      canDrag: false,
    });
  });

  it('cell 内块按同父兄弟计算（父容器内首块禁上移）', () => {
    const cellSibs = [sBlock(20, 25, '7:60'), sBlock(28, 30, '7:60')];
    const inner = entry(20, 25, { parent: '7:60' });
    const s = computeToolbarState(inner, cellSibs);
    expect(s.canMoveUp).toBe(false);
    expect(s.canMoveDown).toBe(true);
    expect(s.moveDownTo).toBe(30);
  });
});

describe('createToolbar：DOM 与回调', () => {
  let deps: ToolbarDeps & {
    onEdit: Mock<ToolbarDeps['onEdit']>;
    onMove: Mock<ToolbarDeps['onMove']>;
    onDelete: Mock<ToolbarDeps['onDelete']>;
    onInsertBelow: Mock<ToolbarDeps['onInsertBelow']>;
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    deps = {
      t,
      siblingsOf: () => SIBS,
      onEdit: vi.fn<ToolbarDeps['onEdit']>(),
      onMove: vi.fn<ToolbarDeps['onMove']>(),
      onDelete: vi.fn<ToolbarDeps['onDelete']>(),
      onInsertBelow: vi.fn<ToolbarDeps['onInsertBelow']>(),
    };
  });

  const buttons = (bar: HTMLElement) =>
    Array.from(bar.querySelectorAll('button')) as HTMLButtonElement[];

  it('初始隐藏；showFor 显示并按状态禁用按钮，hide 收起', () => {
    const tb = createToolbar(document, deps);
    expect(tb.el.hidden).toBe(true);
    const mid = entry(7, 10);
    tb.showFor(mid);
    expect(tb.el.hidden).toBe(false);
    expect(tb.current()).toBe(mid);
    const [drag, edit, up, down, del, ins] = buttons(tb.el);
    expect([drag.disabled, edit.disabled, up.disabled, down.disabled, del.disabled, ins.disabled]).toEqual([
      false, false, false, false, false, false,
    ]);
    tb.hide();
    expect(tb.el.hidden).toBe(true);
    expect(tb.current()).toBeNull();
  });

  it('指令块：编辑可用（检查器语义）；cell 编辑禁用（带提示），拖拽/移动/删除/下方插入可用', () => {
    const tb = createToolbar(document, deps);
    tb.showFor(entry(7, 10, { kind: 'containerDirective', name: 'grid' }));
    let [drag, edit, up, down, del, ins] = buttons(tb.el);
    expect(edit.disabled).toBe(false);
    expect([drag.disabled, up.disabled, down.disabled, del.disabled, ins.disabled]).toEqual([
      false, false, false, false, false,
    ]);
    tb.hide();
    tb.showFor(entry(7, 10, { kind: 'containerDirective', name: 'cell' }));
    [drag, edit, up, down, del, ins] = buttons(tb.el);
    expect(edit.disabled).toBe(true);
    expect(edit.title).toBe(t('editUnsupported'));
    // cell 同样可拖（同 grid 重排 / 跨 grid 移动）
    expect([drag.disabled, up.disabled, down.disabled, del.disabled, ins.disabled]).toEqual([
      false, false, false, false, false,
    ]);
  });

  it('点击触发对应回调（上移传前一兄弟 start，下移传后一兄弟 end）', () => {
    const tb = createToolbar(document, deps);
    const mid = entry(7, 10);
    tb.showFor(mid);
    const [, edit, up, down, del, ins] = buttons(tb.el);
    edit.click();
    expect(deps.onEdit).toHaveBeenCalledWith(mid);
    up.click();
    expect(deps.onMove).toHaveBeenCalledWith(mid, 0);
    down.click();
    expect(deps.onMove).toHaveBeenCalledWith(mid, 20);
    del.click();
    expect(deps.onDelete).toHaveBeenCalledWith(mid);
    ins.click();
    expect(deps.onInsertBelow).toHaveBeenCalledWith(mid);
  });

  it('禁用按钮点击不触发回调（首块上移）', () => {
    const tb = createToolbar(document, deps);
    tb.showFor(entry(0, 5));
    buttons(tb.el)[2].click(); // 上移（禁用）
    expect(deps.onMove).not.toHaveBeenCalled();
  });

  it('拖拽手柄：draggable + 字典 title；无服务端数据（hash 缺失）禁用', () => {
    const tb = createToolbar(document, deps);
    expect(tb.dragHandle.draggable).toBe(true);
    expect(tb.dragHandle.title).toBe(t('dragMove'));
    tb.showFor(entry(7, 10));
    expect(tb.dragHandle.disabled).toBe(false);
    tb.showFor(entry(7, 10, { hash: undefined, kind: undefined, parent: undefined }));
    expect(tb.dragHandle.disabled).toBe(true);
  });
});

describe('bindHover：document 级事件委托（M12f）', () => {
  /** 假工具条：bindHover 只依赖 el 事件与 showFor/hide */
  function fakeToolbar(): {
    tb: Toolbar;
    showFor: ReturnType<typeof vi.fn>;
    hide: ReturnType<typeof vi.fn>;
  } {
    const bar = document.createElement('div');
    bar.className = 'oh-toolbar';
    document.body.append(bar);
    const showFor = vi.fn();
    const hide = vi.fn();
    const dragHandle = document.createElement('button');
    bar.append(dragHandle);
    return { tb: { el: bar, dragHandle, showFor, hide, current: () => null }, showFor, hide };
  }

  /** 建一个带坐标的块元素（tag/属性可定制）并登记到 entryByEl */
  function blockEl(
    entryByEl: Map<Element, BlockEntry>,
    start: number,
    attrs: Record<string, string> = {}
  ): { el: HTMLElement; entry: BlockEntry } {
    const el = document.createElement('div');
    el.setAttribute('data-oh-src', `pages/zh/index.md:${start},${start + 10}`);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.append(el);
    const e: BlockEntry = {
      el,
      span: { source: 'pages/zh/index.md', start, end: start + 10 },
      kind: 'paragraph',
      parent: 'root',
      hash: `h${start}`,
      markdown: 'x',
    };
    entryByEl.set(el, e);
    return { el, entry: e };
  }

  const mouseover = (el: Element) =>
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('嵌套块只亮最内层（grid>cell>段落模型），工具条锚定内层', () => {
    const entryByEl = new Map<Element, BlockEntry>();
    const outer = blockEl(entryByEl, 0);
    const inner = blockEl(entryByEl, 20);
    outer.el.append(inner.el);
    const span = document.createElement('span');
    inner.el.append(span);
    const { tb, showFor } = fakeToolbar();
    bindHover(document, entryByEl, tb);

    mouseover(span); // 指针在内层块的更深元素上
    expect(inner.el.classList.contains(HOVER_CLASS)).toBe(true);
    expect(outer.el.classList.contains(HOVER_CLASS)).toBe(false);
    expect(showFor).toHaveBeenCalledWith(inner.entry);

    // 内层 → 外层自己的区域：描边移到外层
    mouseover(outer.el);
    expect(outer.el.classList.contains(HOVER_CLASS)).toBe(true);
    expect(inner.el.classList.contains(HOVER_CLASS)).toBe(false);
    expect(showFor).toHaveBeenCalledWith(outer.entry);
  });

  it('移出到无坐标区域：400ms 后隐藏工具条；进入工具条本身取消隐藏', () => {
    const entryByEl = new Map<Element, BlockEntry>();
    const { el } = blockEl(entryByEl, 0);
    const { tb, showFor, hide } = fakeToolbar();
    bindHover(document, entryByEl, tb);

    mouseover(el);
    expect(showFor).toHaveBeenCalledTimes(1);
    mouseover(document.body); // 无坐标区域
    vi.advanceTimersByTime(399);
    expect(hide).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(hide).toHaveBeenCalledTimes(1);

    // 再次 hover，移向工具条：mouseenter 取消待执行的隐藏
    hide.mockClear();
    mouseover(el);
    mouseover(document.body);
    tb.el.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(1000);
    expect(hide).not.toHaveBeenCalled();
  });

  it('cfg 坐标用虚线描边且不出块工具条；离开窗口（mouseout 无 relatedTarget）清理', () => {
    const entryByEl = new Map<Element, BlockEntry>();
    const { el } = blockEl(entryByEl, 0);
    const cfg = document.createElement('span');
    cfg.setAttribute('data-oh-cfg', 'site.title@zh');
    document.body.append(cfg);
    const { tb, showFor, hide } = fakeToolbar();
    bindHover(document, entryByEl, tb);

    mouseover(cfg);
    expect(cfg.classList.contains(HOVER_CFG_CLASS)).toBe(true);
    expect(showFor).not.toHaveBeenCalled();
    expect(hide).toHaveBeenCalledTimes(1);

    // 离开窗口：描边清除 + 计划隐藏
    hide.mockClear();
    mouseover(el);
    expect(el.classList.contains(HOVER_CLASS)).toBe(true);
    document.body.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: null }));
    expect(el.classList.contains(HOVER_CLASS)).toBe(false);
    vi.advanceTimersByTime(400);
    expect(hide).toHaveBeenCalledTimes(1);
  });
});
