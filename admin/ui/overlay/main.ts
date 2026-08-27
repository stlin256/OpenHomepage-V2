/**
 * 可视化编辑 overlay 入口（M12b，docs/specs/12 §2.4）：
 * 顶栏（编辑模式标识 + 状态 live region + ＋插入 + 退出编辑）、块注册表（scanner）
 * + 服务端块数据合并（hash/kind/parent/原文切片/指令属性表）、hover 描边 + 浮动工具条（toolbar）、
 * 文本块就地微编辑器（textedit，点击块或工具条「编辑」进入，§3）、插入抽屉（inserter）、
 * 右侧检查器（inspector，M12c：指令参数表单 + grid 列设置/单元格增删，点击指令块或
 * 工具条「编辑」进入）。
 * 每次写操作成功后整页刷新（§2.6 既定流程；sessionStorage 保持编辑模式）。
 * 由渲染页 bootstrap（BaseLayout，OH_EDIT=1 时输出）以经典脚本跨 origin 动态加载；
 * 界面文案走 admin/shared/i18n.ts 字典（与 admin 同一语言记忆）。
 */
import { createT, detectLang } from '../../shared/i18n.ts';
import { el } from '../dom.ts';
import {
  scanBlocks,
  mergeServerBlocks,
  type BlockEntry,
  type ServerBlock,
} from './scanner.ts';
import {
  adminOrigin,
  pageSource,
  fetchBlocks,
  fetchAssets,
  applyBlockOp,
  uploadAsset,
  type BlockOpPayload,
} from './api.ts';
import { createToolbar, isTextEditable, isInspectable, type Toolbar } from './toolbar.ts';
import { openTextEditor, type TextEditSession } from './textedit.ts';
import { createInserter, resolveInsertTarget } from './inserter.ts';
import { createInspector, gridCellSnippet } from './inspector.ts';

/** hover 描边 class（样式在 overlay.css；outline 不占用布局空间） */
const HOVER_CLASS = 'oh-hover';
/** 编辑模式会话标记（与 BaseLayout bootstrap 同一 key） */
const STORAGE_KEY = 'oh-edit';
/** 与 admin 顶栏同一语言记忆 key */
const LANG_KEY = 'oh-admin-lang';

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** 顶栏：徽标 + 状态（polite live region）+ ＋插入 + 退出编辑（清 sessionStorage 标记并刷新） */
function createTopBar(
  t: (k: string) => string,
  statusEl: HTMLElement,
  onInsert: () => void
): HTMLElement {
  const exit = el('button', { class: 'oh-exit', type: 'button' }, t('exitEdit'));
  exit.addEventListener('click', () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage 不可用时直接刷新即可 */
    }
    location.reload();
  });
  const insert = el('button', { class: 'oh-insert', type: 'button' }, `＋ ${t('insertBlock')}`);
  insert.addEventListener('click', onInsert);
  return el(
    'div',
    { class: 'oh-topbar', role: 'region', 'aria-label': t('editModeBadge') },
    el('span', { class: 'oh-badge' }, t('editModeBadge')),
    statusEl,
    insert,
    exit
  );
}

/** hover 描边高亮 + 工具条锚定：工具条自身上的指针不触发重锚/隐藏，移出块后短暂延迟隐藏（便于移到工具条上） */
function bindHover(doc: Document, entryByEl: Map<Element, BlockEntry>, toolbar: Toolbar): void {
  let current: Element | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const clearTimer = () => clearTimeout(hideTimer);
  const scheduleHide = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => toolbar.hide(), 150);
  };
  toolbar.el.addEventListener('mouseenter', clearTimer);
  toolbar.el.addEventListener('mouseleave', scheduleHide);
  doc.addEventListener('mouseover', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.oh-toolbar')) return;
    const block = target.closest('[data-oh-src]');
    if (block === current) return;
    current?.classList.remove(HOVER_CLASS);
    current = block;
    current?.classList.add(HOVER_CLASS);
    const entry = block ? entryByEl.get(block) : undefined;
    if (entry) {
      clearTimer();
      toolbar.showFor(entry);
    } else {
      scheduleHide();
    }
  });
}

/** 点击块进入编辑（§3）：文本块 → 原位微编辑器；指令块（除 cell）→ 右侧检查器（M12c） */
function bindClickToEdit(
  doc: Document,
  entryByEl: Map<Element, BlockEntry>,
  openText: (entry: BlockEntry) => void,
  openInspector: (entry: BlockEntry) => void
): void {
  doc.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    // overlay 自身控件不触发块编辑
    if (
      target.closest('.oh-topbar, .oh-toolbar, .oh-textedit, .oh-drawer, .oh-drawer-mask, .oh-inspector, .oh-inspector-mask')
    ) {
      return;
    }
    const blockEl = target.closest('[data-oh-src]');
    const entry = blockEl ? entryByEl.get(blockEl) : undefined;
    if (!entry) return;
    if (isTextEditable(entry)) {
      event.preventDefault();
      openText(entry);
    } else if (isInspectable(entry)) {
      event.preventDefault();
      openInspector(entry);
    }
  });
}

/** 按注册表出现的 fileRef 逐文件拉取服务端块数据并合并进注册表 */
async function loadBlockData(
  entries: BlockEntry[],
  serverBlocks: Map<string, ServerBlock[]>,
  t: (k: string) => string,
  setStatus: (msg: string, kind?: 'ok' | 'err') => void
): Promise<void> {
  if (!adminOrigin()) return; // 无 origin（jsdom/异常注入）：退化为仅坐标注册表，不联网
  const sources = [...new Set(entries.map((e) => e.span.source))];
  for (const source of sources) {
    try {
      const blocks = await fetchBlocks(source);
      serverBlocks.set(source, blocks);
      mergeServerBlocks(entries, source, blocks);
    } catch (e) {
      console.warn(`[overlay] 块数据加载失败：${source}`, e);
      setStatus(`${t('blockDataFailed')}: ${(e as Error).message}`, 'err');
    }
  }
}

export interface OverlayHandle {
  /** 块注册表（DOM ↔ 坐标；服务端数据异步合并进同一批对象） */
  blocks: BlockEntry[];
  /** 服务端块数据合并完成（无 admin origin 时立即完成） */
  ready: Promise<void>;
}

/** 初始化 overlay：顶栏 + 块注册表 + 工具条/微编辑器/插入抽屉 + hover/点击绑定 */
export function initOverlay(doc: Document): OverlayHandle {
  const t = createT(detectLang(navigator.language, readStored(LANG_KEY)));
  doc.documentElement.classList.add('oh-editing');
  const entries = scanBlocks(doc);
  const entryByEl = new Map<Element, BlockEntry>(entries.map((e) => [e.el, e]));
  /** 服务端口径块列表（按文件）：同父兄弟解析/移动目标计算用 */
  const serverBlocks = new Map<string, ServerBlock[]>();

  const statusEl = el('span', { class: 'oh-status', role: 'status', 'aria-live': 'polite' });
  const setStatus = (msg: string, kind?: 'ok' | 'err'): void => {
    statusEl.textContent = msg;
    statusEl.classList.toggle('oh-err', kind === 'err');
  };

  /** 写操作统一入口：API → 成功整页刷新（§2.6）；失败顶栏报错并 rethrow（微编辑器据此保持打开） */
  async function runOp(payload: BlockOpPayload): Promise<void> {
    setStatus(t('saving'));
    try {
      await applyBlockOp(payload);
    } catch (e) {
      setStatus(`${t('opFailed')}: ${(e as Error).message}`, 'err');
      throw e;
    }
    setStatus(t('saved'), 'ok');
    location.reload();
  }
  const runOpQuiet = (payload: BlockOpPayload): void => {
    void runOp(payload).catch(() => {
      /* 错误已显示在顶栏 */
    });
  };

  const inserter = createInserter(doc, {
    t,
    onPick: (markdown, anchor) => {
      const target = resolveInsertTarget(entries, anchor, pageSource());
      if (!target) {
        setStatus(t('opFailed'), 'err');
        return;
      }
      const payload: BlockOpPayload = target.anchor
        ? {
            path: target.source,
            op: 'insert',
            start: target.anchor.span.start,
            end: target.anchor.span.end,
            hash: target.anchor.hash ?? '',
            markdown,
          }
        : {
            path: target.source,
            op: 'insert',
            start: target.boundary ?? 0,
            end: target.boundary ?? 0,
            hash: '',
            markdown,
          };
      runOpQuiet(payload);
    },
  });

  // ---- 微编辑器会话（同时只开一个；开新的先取消旧的并还原 DOM）----
  let activeEdit: TextEditSession | null = null;
  const cancelActiveEdit = async (): Promise<void> => {
    const prev = activeEdit;
    activeEdit = null;
    if (prev) await prev.cancel();
  };

  // ---- 右侧检查器（M12c）：指令参数表单 + grid 列设置/单元格增删 ----
  const inspector = createInspector(doc, {
    t,
    loadAssets: fetchAssets,
    cellsOf: (grid) =>
      (serverBlocks.get(grid.span.source) ?? []).filter(
        (b) =>
          b.parent === `${grid.span.start}:${grid.span.end}` &&
          b.kind === 'containerDirective' &&
          b.name === 'cell'
      ),
    onSaveAttrs: (entry, attrs) =>
      runOp({
        path: entry.span.source,
        op: 'attrs',
        start: entry.span.start,
        end: entry.span.end,
        hash: entry.hash ?? '',
        attrs,
      }),
    onDeleteCell: (cell, grid) => {
      if (!confirm(t('confirmDeleteBlock'))) return;
      runOpQuiet({
        path: grid.span.source,
        op: 'delete',
        start: cell.start,
        end: cell.end,
        hash: cell.hash,
      });
    },
    onAddCell: (grid) =>
      runOpQuiet({
        path: grid.span.source,
        op: 'insert',
        start: grid.span.start,
        end: grid.span.end,
        hash: grid.hash ?? '',
        markdown: gridCellSnippet(grid.markdown ?? ''),
        into: true,
      }),
  });

  const toolbar = createToolbar(doc, {
    t,
    siblingsOf: (entry) =>
      serverBlocks.get(entry.span.source)?.filter((b) => b.parent === entry.parent) ?? [],
    // 「编辑」分流：指令块（除 cell）→ 检查器参数面板；文本块 → 微编辑器
    onEdit: (entry) => {
      if (isInspectable(entry)) {
        void cancelActiveEdit();
        inspector.open(entry);
      } else {
        void openEditor(entry);
      }
    },
    onMove: (entry, to) =>
      runOpQuiet({
        path: entry.span.source,
        op: 'move',
        start: entry.span.start,
        end: entry.span.end,
        hash: entry.hash ?? '',
        to,
      }),
    onDelete: (entry) => {
      if (!confirm(t('confirmDeleteBlock'))) return;
      runOpQuiet({
        path: entry.span.source,
        op: 'delete',
        start: entry.span.start,
        end: entry.span.end,
        hash: entry.hash ?? '',
      });
    },
    onInsertBelow: (entry) => inserter.open(entry),
  });

  async function openEditor(entry: BlockEntry): Promise<void> {
    await cancelActiveEdit();
    inspector.close();
    toolbar.hide();
    const session = await openTextEditor(entry, {
      t,
      onSave: (markdown) =>
        runOp({
          path: entry.span.source,
          op: 'replace',
          start: entry.span.start,
          end: entry.span.end,
          hash: entry.hash ?? '',
          markdown,
        }),
      onCancel: () => {
        if (activeEdit === session) activeEdit = null;
      },
      // 粘贴图片：二进制上传（命名 pasted-<时间戳>.<ext>），插入 assets/<name> 引用
      onPasteImage: async (file) => {
        const ext = (file.name.split('.').pop() || 'png').toLowerCase();
        const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        try {
          const r = await uploadAsset(`pasted-${stamp}.${ext}`, await file.arrayBuffer());
          return `assets/${r.name}`;
        } catch (e) {
          setStatus(`${t('opFailed')}: ${(e as Error).message}`, 'err');
          return null;
        }
      },
    });
    activeEdit = session;
  }

  doc.body.append(createTopBar(t, statusEl, () => inserter.open(null)));
  bindHover(doc, entryByEl, toolbar);
  bindClickToEdit(
    doc,
    entryByEl,
    (entry) => void openEditor(entry),
    (entry) => {
      void cancelActiveEdit();
      inspector.open(entry);
    }
  );

  const ready = loadBlockData(entries, serverBlocks, t, setStatus);
  return { blocks: entries, ready };
}

// 入口自举：脚本由 bootstrap 动态插入（时序不定），等待 DOM 就绪后初始化
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initOverlay(document), { once: true });
  } else {
    initOverlay(document);
  }
}
