/**
 * overlay 撤销/重做（快照兜底，admin/server/history.ts 的客户端）：
 * 顶栏按钮（按 GET /api/history 置灰）+ Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y 快捷键。
 * 操作目标 = 服务端记录的最近写盘文件（块操作→页面 md、配置保存→site/rss.yaml），
 * 以文件为粒度回滚到上一次写盘前状态；成功后沿用既定流程整页刷新（spec 12 §2.6）。
 * 焦点在 input/textarea/select/contenteditable/微编辑器内时不劫持快捷键
 * （Milkdown 微编辑器内部有自己的撤销历史，劫持会导致两边各撤销一步）。
 */
import { el } from '../dom.ts';
import {
  fetchHistory,
  undoHistory,
  redoHistory,
  type HistoryState,
  type HistoryOpResult,
} from './api.ts';

export interface HistoryControls {
  /** 顶栏按钮组（撤销 / 重做） */
  el: HTMLElement;
  undoBtn: HTMLButtonElement;
  redoBtn: HTMLButtonElement;
  /** 拉取 GET /api/history 刷新置灰（页面加载与写操作失败后调用；拉取失败保持禁用） */
  refresh: () => Promise<void>;
}

export interface HistoryDeps {
  t: (k: string) => string;
  /** 写操作统一入口（成功整页刷新、失败顶栏报错并 rethrow）；undo/redo 复用 */
  runSave: <T>(action: () => Promise<T>) => Promise<void>;
  /** 以下为可注入替身（jsdom 测试）；缺省走 admin API */
  fetchState?: () => Promise<HistoryState>;
  undo?: () => Promise<HistoryOpResult>;
  redo?: () => Promise<HistoryOpResult>;
}

/** 快捷键解析：Ctrl+Z=撤销，Ctrl+Shift+Z / Ctrl+Y=重做（mac 兼容 metaKey）；其余 null */
export function resolveHistoryShortcut(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): 'undo' | 'redo' | null {
  if (e.altKey || (!e.ctrlKey && !e.metaKey)) return null;
  const key = e.key.toLowerCase();
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && e.ctrlKey) return 'redo';
  return null;
}

/** 焦点在输入控件/就地编辑面内不劫持（内部编辑有自己的撤销历史） */
function inEditableContext(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), .oh-textedit, .oh-cfgedit'
    ) !== null
  );
}

export function createHistoryControls(doc: Document, deps: HistoryDeps): HistoryControls {
  const { t } = deps;
  const fetchState = deps.fetchState ?? fetchHistory;
  const undoApi = deps.undo ?? undoHistory;
  const redoApi = deps.redo ?? redoHistory;

  const undoBtn = el(
    'button',
    { class: 'oh-undo', type: 'button', title: t('undo') },
    t('undo')
  ) as HTMLButtonElement;
  const redoBtn = el(
    'button',
    { class: 'oh-redo', type: 'button', title: t('redo') },
    t('redo')
  ) as HTMLButtonElement;
  // 初始禁用：待 refresh 拉到服务端状态后再放开
  undoBtn.disabled = true;
  redoBtn.disabled = true;

  async function refresh(): Promise<void> {
    try {
      const state = await fetchState();
      undoBtn.disabled = !state.canUndo;
      redoBtn.disabled = !state.canRedo;
    } catch {
      // 状态拉取失败（admin 不可达等）：保持禁用，不阻断编辑
      undoBtn.disabled = true;
      redoBtn.disabled = true;
    }
  }

  // 无可撤销/重做时服务端 ok:false——抛错走 runSave 失败提示（不刷新页面），随后刷新置灰
  const doUndo = (): void => {
    void deps
      .runSave(async () => {
        const r = await undoApi();
        if (!r.ok) throw new Error(t('nothingToUndo'));
      })
      .catch(() => void refresh());
  };
  const doRedo = (): void => {
    void deps
      .runSave(async () => {
        const r = await redoApi();
        if (!r.ok) throw new Error(t('nothingToRedo'));
      })
      .catch(() => void refresh());
  };

  undoBtn.addEventListener('click', doUndo);
  redoBtn.addEventListener('click', doRedo);

  doc.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    const op = resolveHistoryShortcut(event);
    if (!op || inEditableContext(event.target)) return;
    // 按钮置灰 = 无可 undo/redo（或服务端无写盘记录），快捷键同样不动作
    if (op === 'undo' ? undoBtn.disabled : redoBtn.disabled) return;
    event.preventDefault();
    if (op === 'undo') doUndo();
    else doRedo();
  });

  // display:contents（见 overlay.css）：两个按钮直接参与顶栏 flex 布局
  return { el: el('span', { class: 'oh-history' }, undoBtn, redoBtn), undoBtn, redoBtn, refresh };
}
