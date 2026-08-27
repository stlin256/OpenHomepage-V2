/**
 * 浮动工具条（admin/ui/overlay/toolbar.ts，M12b）jsdom 测试：
 * 按钮可用性逻辑（指令块禁编辑、首/末兄弟块禁上移/下移、无 hash 全禁）、
 * 点击回调（编辑/移动目标坐标/删除/下方插入）与 showFor/hide 显隐。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createToolbar,
  computeToolbarState,
  isTextEditable,
  type ToolbarDeps,
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
  it('指令块禁编辑；其余操作不受影响', () => {
    const grid = entry(7, 10, { kind: 'containerDirective', name: 'grid' });
    const s = computeToolbarState(grid, SIBS);
    expect(s.canEdit).toBe(false);
    expect(s.canMoveUp).toBe(true);
    expect(s.canMoveDown).toBe(true);
    expect(s.canDelete).toBe(true);
    expect(s.canInsert).toBe(true);
    const leaf = entry(7, 10, { kind: 'leafDirective', name: 'stream' });
    expect(isTextEditable(leaf)).toBe(false);
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
    onEdit: ReturnType<typeof vi.fn>;
    onMove: ReturnType<typeof vi.fn>;
    onDelete: ReturnType<typeof vi.fn>;
    onInsertBelow: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    deps = {
      t,
      siblingsOf: () => SIBS,
      onEdit: vi.fn(),
      onMove: vi.fn(),
      onDelete: vi.fn(),
      onInsertBelow: vi.fn(),
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
    const [edit, up, down, del, ins] = buttons(tb.el);
    expect([edit.disabled, up.disabled, down.disabled, del.disabled, ins.disabled]).toEqual([
      false, false, false, false, false,
    ]);
    tb.hide();
    expect(tb.el.hidden).toBe(true);
    expect(tb.current()).toBeNull();
  });

  it('指令块：编辑禁用（带提示），移动/删除/下方插入可用', () => {
    const tb = createToolbar(document, deps);
    tb.showFor(entry(7, 10, { kind: 'containerDirective', name: 'grid' }));
    const [edit, up, down, del, ins] = buttons(tb.el);
    expect(edit.disabled).toBe(true);
    expect(edit.title).toBe(t('editUnsupported'));
    expect([up.disabled, down.disabled, del.disabled, ins.disabled]).toEqual([
      false, false, false, false,
    ]);
  });

  it('点击触发对应回调（上移传前一兄弟 start，下移传后一兄弟 end）', () => {
    const tb = createToolbar(document, deps);
    const mid = entry(7, 10);
    tb.showFor(mid);
    const [edit, up, down, del, ins] = buttons(tb.el);
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
    buttons(tb.el)[1].click(); // 上移（禁用）
    expect(deps.onMove).not.toHaveBeenCalled();
  });
});
