/**
 * 块拖拽（admin/ui/overlay/dnd.ts）jsdom 测试：
 * - dragstart：记录源块（工具条当前块）、源块半透明、effectAllowed=move；无 hash 不发起；
 * - dragover 落点解析：块上/下半区 → 之前/之后边界 + 指示线；空 grid/cell 中部 → into
 *   （高亮容器边框，to = 闭围栏行首）；空容器贴边 10px 内仍算之前/之后；
 * - 合法性判定：源块自身/其子孙块、overlay 控件、无坐标区域 → 不 preventDefault
 *   （禁止光标，drop 不触发），dropEffect=none；
 * - drop：合法落点 → onDrop(entry, to) 并清理；Esc / dragend 取消（中途不改数据）。
 * jsdom 无 DragEvent：以 MouseEvent（带 clientY）+ dataTransfer 桩手工派发。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  bindBlockDrag,
  resolveDropTarget,
  containerIntoOffset,
  DROP_LINE_CLASS,
  DRAG_SOURCE_CLASS,
  DROP_INTO_CLASS,
  type DragController,
  type DropTarget,
} from '../admin/ui/overlay/dnd.ts';
import type { BlockEntry } from '../admin/ui/overlay/scanner.ts';

/** dataTransfer 桩（jsdom 无实现；只用到 effectAllowed/dropEffect/setData） */
function dtStub() {
  return { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn(() => '') };
}
type DtStub = ReturnType<typeof dtStub>;

/** 手工派发拖拽事件：MouseEvent（bubbles + cancelable + clientY）挂 dataTransfer 桩 */
function fireDrag(
  type: string,
  target: Element | Document,
  opts: { clientY?: number; dt?: DtStub } = {}
): MouseEvent {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientY: opts.clientY ?? 0 });
  Object.defineProperty(e, 'dataTransfer', { value: opts.dt ?? dtStub() });
  target.dispatchEvent(e);
  return e;
}

/** 注册表块元素（tag/父元素/属性可定制），并登记进 byEl 映射 */
function makeEntry(
  byEl: Map<Element, BlockEntry>,
  start: number,
  end: number,
  extra: Partial<BlockEntry> = {},
  parent?: Element
): BlockEntry {
  const el = document.createElement('div');
  el.setAttribute('data-oh-src', `pages/zh/index.md:${start},${end}`);
  (parent ?? document.body).append(el);
  const entry: BlockEntry = {
    el,
    span: { source: 'pages/zh/index.md', start, end },
    kind: 'paragraph',
    parent: 'root',
    hash: `h${start}`,
    markdown: 'x',
    ...extra,
  };
  byEl.set(el, entry);
  return entry;
}

/** jsdom 的 getBoundingClientRect 全为 0：按测试场景打桩 */
function stubRect(el: Element, top: number, bottom: number, left = 8, width = 300): void {
  el.getBoundingClientRect = () =>
    ({
      top,
      bottom,
      left,
      width,
      right: left + width,
      height: bottom - top,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

interface Fixture {
  handle: HTMLButtonElement;
  byEl: Map<Element, BlockEntry>;
  onDrop: ReturnType<typeof vi.fn>;
  dc: DragController;
  /** 设置/替换工具条当前块（拖动源） */
  setCurrent(entry: BlockEntry | null): void;
  /** 源块（makeEntry 登记）并发起 dragstart */
  startDrag(entry: BlockEntry, dt?: DtStub): MouseEvent;
  line(): HTMLElement;
}

function setup(): Fixture {
  document.body.innerHTML = '';
  const handle = document.createElement('button');
  document.body.append(handle);
  const byEl = new Map<Element, BlockEntry>();
  const onDrop = vi.fn();
  let current: BlockEntry | null = null;
  const dc = bindBlockDrag(document, {
    handle,
    currentEntry: () => current,
    entryOf: (el) => byEl.get(el),
    onDrop,
  });
  return {
    handle,
    byEl,
    onDrop,
    dc,
    setCurrent: (e) => {
      current = e;
    },
    startDrag: (entry, dt) => {
      current = entry;
      return fireDrag('dragstart', handle, { dt });
    },
    line: () => document.querySelector(`.${DROP_LINE_CLASS}`) as HTMLElement,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  // 清理各用例遗留的拖拽状态：document 级监听不随 body 清空移除，
  // Esc 触发所有已绑定控制器的取消（未拖拽的 controller 不受影响）
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
});

describe('dragstart：发起与守卫', () => {
  it('记录源块（工具条当前块）、源块半透明、effectAllowed=move、setData 兜底（Firefox）', () => {
    const f = setup();
    const a = makeEntry(f.byEl, 0, 5);
    const dt = dtStub();
    f.startDrag(a, dt);
    expect(f.dc.isDragging()).toBe(true);
    expect(a.el.classList.contains(DRAG_SOURCE_CLASS)).toBe(true);
    expect(dt.effectAllowed).toBe('move');
    expect(dt.setData).toHaveBeenCalled();
  });

  it('无服务端数据（hash 缺失）不发起拖拽（preventDefault）', () => {
    const f = setup();
    const a = makeEntry(f.byEl, 0, 5, { hash: undefined });
    const e = f.startDrag(a);
    expect(e.defaultPrevented).toBe(true);
    expect(f.dc.isDragging()).toBe(false);
    expect(a.el.classList.contains(DRAG_SOURCE_CLASS)).toBe(false);
  });

  it('工具条无当前块时不发起拖拽', () => {
    const f = setup();
    const e = fireDrag('dragstart', f.handle);
    expect(e.defaultPrevented).toBe(true);
    expect(f.dc.isDragging()).toBe(false);
  });
});

describe('dragover：落点解析与指示', () => {
  it('块上半区 → 之前边界（to = 块 start），指示线锚定上沿，dropEffect=move', () => {
    const f = setup();
    const a = makeEntry(f.byEl, 0, 5);
    const b = makeEntry(f.byEl, 10, 20);
    stubRect(b.el, 100, 140);
    f.startDrag(a);
    const dt = dtStub();
    const e = fireDrag('dragover', b.el, { clientY: 110, dt });
    expect(e.defaultPrevented).toBe(true);
    expect(dt.dropEffect).toBe('move');
    const target = f.dc.activeTarget();
    expect(target).toMatchObject({ to: 10, kind: 'before', el: b.el });
    expect(f.line().hidden).toBe(false);
    expect(f.line().style.top).toBe('100px');
    expect(f.line().style.width).toBe('300px');
  });

  it('块下半区 → 之后边界（to = 块 end），指示线锚定下沿', () => {
    const f = setup();
    const a = makeEntry(f.byEl, 0, 5);
    const b = makeEntry(f.byEl, 10, 20);
    stubRect(b.el, 100, 140);
    f.startDrag(a);
    fireDrag('dragover', b.el, { clientY: 130 });
    expect(f.dc.activeTarget()).toMatchObject({ to: 20, kind: 'after' });
    expect(f.line().style.top).toBe('140px');
  });

  it('空 cell 中部 → into 落点（to = 闭围栏行首），高亮容器边框而非指示线', () => {
    const f = setup();
    const a = makeEntry(f.byEl, 0, 5);
    // 空 cell：容器元素内无子坐标块；markdown = ':::cell\n:::'（闭围栏行首相对 offset = 8）
    const cell = makeEntry(f.byEl, 100, 111, {
      kind: 'containerDirective',
      name: 'cell',
      parent: '90:120',
      markdown: ':::cell\n:::',
    });
    stubRect(cell.el, 200, 260);
    f.startDrag(a);
    fireDrag('dragover', cell.el, { clientY: 230 });
    expect(f.dc.activeTarget()).toMatchObject({ to: 108, kind: 'into', el: cell.el });
    expect(cell.el.classList.contains(DROP_INTO_CLASS)).toBe(true);
    expect(f.line().hidden).toBe(true);
    // 移到别的块上：into 高亮清除
    const b = makeEntry(f.byEl, 300, 310);
    stubRect(b.el, 400, 440);
    fireDrag('dragover', b.el, { clientY: 410 });
    expect(cell.el.classList.contains(DROP_INTO_CLASS)).toBe(false);
  });

  it('空容器贴顶/底 10px 内仍算之前/之后（保证容器外边界落点可达）；过矮（≤20px）整体算 into', () => {
    const f = setup();
    const a = makeEntry(f.byEl, 0, 5);
    const cell = makeEntry(f.byEl, 100, 111, {
      kind: 'containerDirective',
      name: 'cell',
      parent: '90:120',
      markdown: ':::cell\n:::',
    });
    stubRect(cell.el, 200, 260);
    f.startDrag(a);
    fireDrag('dragover', cell.el, { clientY: 205 });
    expect(f.dc.activeTarget()).toMatchObject({ to: 100, kind: 'before' });
    fireDrag('dragover', cell.el, { clientY: 255 });
    expect(f.dc.activeTarget()).toMatchObject({ to: 111, kind: 'after' });
    // 过矮空容器：整体 into
    stubRect(cell.el, 200, 218);
    fireDrag('dragover', cell.el, { clientY: 201 });
    expect(f.dc.activeTarget()).toMatchObject({ to: 108, kind: 'into' });
  });

  it('非空容器按普通块处理（上/下半区），不出 into 落点', () => {
    const f = setup();
    const a = makeEntry(f.byEl, 0, 5);
    const cell = makeEntry(f.byEl, 100, 130, {
      kind: 'containerDirective',
      name: 'cell',
      parent: '90:140',
      markdown: ':::cell\n内\n:::',
    });
    makeEntry(f.byEl, 108, 110, { parent: '100:130' }, cell.el); // 子坐标块 → 非空
    stubRect(cell.el, 200, 260);
    f.startDrag(a);
    fireDrag('dragover', cell.el, { clientY: 230 });
    expect(f.dc.activeTarget()).toMatchObject({ kind: 'after', to: 130 });
    expect(cell.el.classList.contains(DROP_INTO_CLASS)).toBe(false);
  });
});

describe('dragover：非法落点（禁止光标 = 不 preventDefault）', () => {
  it('源块自身与其子孙块：dropEffect=none，无指示，不 preventDefault', () => {
    const f = setup();
    const grid = makeEntry(f.byEl, 0, 50, { kind: 'containerDirective', name: 'grid' });
    const inner = makeEntry(f.byEl, 10, 20, { parent: '0:50' }, grid.el);
    stubRect(grid.el, 100, 200);
    stubRect(inner.el, 120, 140);
    f.startDrag(grid);
    // 源块自身
    const dt1 = dtStub();
    const e1 = fireDrag('dragover', grid.el, { clientY: 110, dt: dt1 });
    expect(e1.defaultPrevented).toBe(false);
    expect(dt1.dropEffect).toBe('none');
    expect(f.dc.activeTarget()).toBeNull();
    expect(f.line().hidden).toBe(true);
    // 子孙块（嵌套内部）
    const dt2 = dtStub();
    const e2 = fireDrag('dragover', inner.el, { clientY: 130, dt: dt2 });
    expect(e2.defaultPrevented).toBe(false);
    expect(dt2.dropEffect).toBe('none');
    expect(f.dc.activeTarget()).toBeNull();
  });

  it('overlay 控件与无坐标区域不解析落点', () => {
    const f = setup();
    const a = makeEntry(f.byEl, 0, 5);
    f.startDrag(a);
    // overlay 控件（工具条按钮）
    const bar = document.createElement('div');
    bar.className = 'oh-toolbar';
    const btn = document.createElement('button');
    bar.append(btn);
    document.body.append(bar);
    const e1 = fireDrag('dragover', btn, { clientY: 10 });
    expect(e1.defaultPrevented).toBe(false);
    expect(f.dc.activeTarget()).toBeNull();
    // 无坐标区域
    const plain = document.createElement('p');
    document.body.append(plain);
    const e2 = fireDrag('dragover', plain, { clientY: 10 });
    expect(e2.defaultPrevented).toBe(false);
    expect(f.dc.activeTarget()).toBeNull();
  });

  it('未拖拽时 dragover 不 preventDefault（不动外来拖拽）', () => {
    setup();
    const plain = document.createElement('p');
    document.body.append(plain);
    const e = fireDrag('dragover', plain, { clientY: 10 });
    expect(e.defaultPrevented).toBe(false);
  });
});

describe('drop 与取消', () => {
  it('合法落点落下 → onDrop(entry, to)，状态与指示清理', () => {
    const f = setup();
    const a = makeEntry(f.byEl, 0, 5);
    const b = makeEntry(f.byEl, 10, 20);
    stubRect(b.el, 100, 140);
    f.startDrag(a);
    fireDrag('dragover', b.el, { clientY: 110 });
    fireDrag('drop', b.el, { clientY: 110 });
    expect(f.onDrop).toHaveBeenCalledWith(a, 10);
    expect(f.dc.isDragging()).toBe(false);
    expect(a.el.classList.contains(DRAG_SOURCE_CLASS)).toBe(false);
    expect(f.line().hidden).toBe(true);
  });

  it('无活跃落点时落下：只清理不调 onDrop（拖拽中途不改数据）', () => {
    const f = setup();
    const a = makeEntry(f.byEl, 0, 5);
    f.startDrag(a);
    fireDrag('drop', document.body);
    expect(f.onDrop).not.toHaveBeenCalled();
    expect(f.dc.isDragging()).toBe(false);
  });

  it('Esc 取消：清理状态，随后的 drop 不再生效', () => {
    const f = setup();
    const a = makeEntry(f.byEl, 0, 5);
    const b = makeEntry(f.byEl, 10, 20);
    stubRect(b.el, 100, 140);
    f.startDrag(a);
    fireDrag('dragover', b.el, { clientY: 110 });
    expect(f.dc.activeTarget()).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(f.dc.isDragging()).toBe(false);
    expect(f.dc.activeTarget()).toBeNull();
    expect(a.el.classList.contains(DRAG_SOURCE_CLASS)).toBe(false);
    expect(f.line().hidden).toBe(true);
    fireDrag('drop', b.el, { clientY: 110 });
    expect(f.onDrop).not.toHaveBeenCalled();
  });

  it('dragend 兜底清理（拖出窗口等无 drop 路径）', () => {
    const f = setup();
    const a = makeEntry(f.byEl, 0, 5);
    const b = makeEntry(f.byEl, 10, 20);
    stubRect(b.el, 100, 140);
    f.startDrag(a);
    fireDrag('dragover', b.el, { clientY: 130 });
    fireDrag('dragend', f.handle);
    expect(f.dc.isDragging()).toBe(false);
    expect(f.dc.activeTarget()).toBeNull();
    expect(a.el.classList.contains(DRAG_SOURCE_CLASS)).toBe(false);
    expect(f.onDrop).not.toHaveBeenCalled();
  });

  it('外来拖拽（非本模块发起）drop 不接管', () => {
    const f = setup();
    const e = fireDrag('drop', document.body);
    expect(e.defaultPrevented).toBe(false);
    expect(f.onDrop).not.toHaveBeenCalled();
  });
});

describe('落点解析纯函数', () => {
  it('containerIntoOffset：仅 grid/cell 容器有效（闭围栏行首绝对坐标），无原文切片返回 null', () => {
    const cell = {
      el: document.createElement('div'),
      span: { source: 'pages/zh/index.md', start: 100, end: 111 },
      kind: 'containerDirective',
      name: 'cell',
      markdown: ':::cell\n:::',
    } as BlockEntry;
    expect(containerIntoOffset(cell)).toBe(108);
    expect(containerIntoOffset({ ...cell, markdown: undefined })).toBeNull();
    expect(containerIntoOffset({ ...cell, name: 'figure' })).toBeNull();
    expect(containerIntoOffset({ ...cell, kind: 'paragraph' })).toBeNull();
  });

  it('resolveDropTarget：figure 等非 grid/cell 空容器不出 into 落点', () => {
    const fig = document.createElement('figure');
    fig.setAttribute('data-oh-src', 'pages/zh/index.md:50,80');
    document.body.append(fig);
    stubRect(fig, 100, 200);
    const entry: BlockEntry = {
      el: fig,
      span: { source: 'pages/zh/index.md', start: 50, end: 80 },
      kind: 'containerDirective',
      name: 'figure',
      hash: 'h',
      markdown: ':::figure\n:::',
    };
    const target: DropTarget = resolveDropTarget(entry, 150);
    expect(target.kind).not.toBe('into');
  });
});
