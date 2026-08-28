/**
 * overlay 撤销/重做（admin/ui/overlay/history.ts）jsdom 测试：
 * 按钮置灰（GET /api/history 状态映射）、点击与快捷键（Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y）
 * 触发 undo/redo、焦点在 input/textarea/select/contenteditable/微编辑器内不劫持、
 * 按钮置灰时快捷键不动作、ok:false 时抛错走 runSave 失败路径并刷新置灰。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  createHistoryControls,
  resolveHistoryShortcut,
  type HistoryDeps,
} from '../admin/ui/overlay/history.ts';
import { createT } from '../admin/shared/i18n.ts';
import type { HistoryState, HistoryOpResult } from '../admin/ui/overlay/api.ts';

const t = createT('zh');
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

/** 注入替身均为 mock（置灰断言/调用计数用） */
interface HistoryMocks {
  runSave: Mock<(action: () => Promise<unknown>) => Promise<void>>;
  fetchState: Mock<() => Promise<HistoryState>>;
  undo: Mock<() => Promise<HistoryOpResult>>;
  redo: Mock<() => Promise<HistoryOpResult>>;
}

function makeDeps(overrides: Partial<HistoryDeps> = {}): HistoryDeps & HistoryMocks {
  const deps: HistoryDeps & HistoryMocks = {
    t,
    runSave: vi.fn(async (action: () => Promise<unknown>) => {
      await action();
    }),
    fetchState: vi.fn(async () => ({ path: 'pages/zh/index.md', canUndo: true, canRedo: false })),
    undo: vi.fn(async () => ({
      path: 'pages/zh/index.md',
      canUndo: false,
      canRedo: true,
      ok: true,
    })),
    redo: vi.fn(async () => ({
      path: 'pages/zh/index.md',
      canUndo: true,
      canRedo: false,
      ok: true,
    })),
  };
  Object.assign(deps, overrides);
  return deps;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('resolveHistoryShortcut', () => {
  const base = { key: 'z', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };

  it('Ctrl+Z=undo，Ctrl+Shift+Z / Ctrl+Y=redo，metaKey 兼容', () => {
    expect(resolveHistoryShortcut(base)).toBe('undo');
    expect(resolveHistoryShortcut({ ...base, shiftKey: true })).toBe('redo');
    expect(resolveHistoryShortcut({ ...base, key: 'y' })).toBe('redo');
    expect(resolveHistoryShortcut({ ...base, ctrlKey: false, metaKey: true })).toBe('undo');
    expect(resolveHistoryShortcut({ ...base, key: 'Z' })).toBe('undo');
  });

  it('无修饰键 / Alt 组合 / 其他键不命中', () => {
    expect(resolveHistoryShortcut({ ...base, ctrlKey: false })).toBeNull();
    expect(resolveHistoryShortcut({ ...base, altKey: true })).toBeNull();
    expect(resolveHistoryShortcut({ ...base, key: 'x' })).toBeNull();
  });
});

describe('createHistoryControls：按钮置灰', () => {
  it('初始禁用；refresh 后按 GET /api/history 状态置灰', async () => {
    const deps = makeDeps();
    const c = createHistoryControls(document, deps);
    document.body.append(c.el);
    expect(c.undoBtn.disabled).toBe(true);
    expect(c.redoBtn.disabled).toBe(true);

    await c.refresh();
    expect(c.undoBtn.disabled).toBe(false); // canUndo
    expect(c.redoBtn.disabled).toBe(true); // canRedo=false

    deps.fetchState.mockResolvedValue({ path: 'p', canUndo: false, canRedo: true });
    await c.refresh();
    expect(c.undoBtn.disabled).toBe(true);
    expect(c.redoBtn.disabled).toBe(false);
  });

  it('状态拉取失败时保持禁用', async () => {
    const deps = makeDeps({ fetchState: vi.fn(async () => Promise.reject(new Error('网络失败'))) });
    const c = createHistoryControls(document, deps);
    await c.refresh();
    expect(c.undoBtn.disabled).toBe(true);
    expect(c.redoBtn.disabled).toBe(true);
  });
});

describe('createHistoryControls：触发', () => {
  it('点击按钮经 runSave 调用 undo/redo API', async () => {
    const deps = makeDeps();
    const c = createHistoryControls(document, deps);
    document.body.append(c.el);
    await c.refresh();
    c.undoBtn.click();
    await tick();
    expect(deps.undo).toHaveBeenCalledTimes(1);
    expect(deps.runSave).toHaveBeenCalledTimes(1);
  });

  it('快捷键：Ctrl+Z=undo，Ctrl+Shift+Z / Ctrl+Y=redo', async () => {
    // 独立 document：避免与其他用例挂在全局 document 上的 keydown 监听互相干扰
    const doc = document.implementation.createHTMLDocument('');
    const deps = makeDeps({
      fetchState: vi.fn(async () => ({ path: 'p', canUndo: true, canRedo: true })),
    });
    const c = createHistoryControls(doc, deps);
    doc.body.append(c.el);
    await c.refresh();

    const press = (init: KeyboardEventInit) =>
      doc.body.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
      );
    press({ key: 'z', ctrlKey: true });
    press({ key: 'z', ctrlKey: true, shiftKey: true });
    press({ key: 'y', ctrlKey: true });
    await tick();
    expect(deps.undo).toHaveBeenCalledTimes(1);
    expect(deps.redo).toHaveBeenCalledTimes(2);
  });

  it('焦点在 input/textarea/select/contenteditable 内不劫持（内部编辑有自己的撤销）', async () => {
    const doc = document.implementation.createHTMLDocument('');
    const deps = makeDeps();
    const c = createHistoryControls(doc, deps);
    doc.body.append(c.el);
    await c.refresh();

    const input = doc.createElement('input');
    const textarea = doc.createElement('textarea');
    const select = doc.createElement('select');
    const editable = doc.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    doc.body.append(input, textarea, select, editable);

    for (const target of [input, textarea, select, editable]) {
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })
      );
    }
    await tick();
    expect(deps.undo).not.toHaveBeenCalled();
    expect(deps.redo).not.toHaveBeenCalled();
  });

  it('按钮置灰时快捷键不动作（无可 undo/redo）', async () => {
    const doc = document.implementation.createHTMLDocument('');
    const deps = makeDeps(); // canUndo=true, canRedo=false
    const c = createHistoryControls(doc, deps);
    doc.body.append(c.el);
    await c.refresh();
    doc.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true, cancelable: true })
    );
    await tick();
    expect(deps.redo).not.toHaveBeenCalled();
  });

  it('ok:false 时 action 抛错（走 runSave 失败提示），随后刷新置灰', async () => {
    const deps = makeDeps({
      undo: vi.fn(async () => ({ path: 'p', canUndo: false, canRedo: false, ok: false })),
      runSave: vi.fn(async (action: () => Promise<unknown>) => {
        await action(); // 与 main.ts 的 runSave 同语义：失败 rethrow
      }),
    });
    const c = createHistoryControls(document, deps);
    document.body.append(c.el);
    await c.refresh();
    deps.fetchState.mockClear();
    c.undoBtn.click();
    await tick();
    expect(deps.undo).toHaveBeenCalledTimes(1);
    // 失败兜底：重新拉取状态刷新置灰
    expect(deps.fetchState).toHaveBeenCalledTimes(1);
  });
});
