/**
 * 可视化编辑 overlay 入口（M12b-d，docs/specs/12 §2.4）：
 * 顶栏（←后台链接 + 编辑模式标识 + 状态 live region + 页面切换下拉 + ＋插入 + 页面设置 + 退出编辑）、
 * 块注册表（scanner）+ 服务端块数据合并（hash/kind/parent/原文切片/指令属性表）、
 * hover 描边 + 浮动工具条（toolbar）、文本块就地微编辑器（textedit）、插入抽屉（inserter）、
 * 右侧检查器（inspector：指令参数表单 + grid 列设置/单元格增删 + M12d 配置区块表单/页面设置）。
 * M12d：data-oh-cfg 字段就地改字（cfgedit → POST /api/config/field）、
 * data-oh-cfg-block 首页配置区块原生表单（cfgpanel → GET/PUT /api/config/site|rss）、
 * 页面设置面板（pagesettings → GET/PUT /api/page）、页面切换下拉（pageswitcher → GET /api/pages）。
 * 点击/hover 命中最内层坐标：cfg 字段 > markdown 块 > cfg-block 区块（resolveHitTarget）。
 * 每次写操作成功后整页刷新（§2.6 既定流程；sessionStorage 保持编辑模式）。
 * 由渲染页 bootstrap（BaseLayout，OH_EDIT=1 时输出）以经典脚本跨 origin 动态加载；
 * 界面文案走 admin/shared/i18n.ts 字典（与 admin 同一语言记忆）。
 */
import { createT, detectLang } from '../../shared/i18n.ts';
import { stepConfigPath } from '../../shared/cfgpath.ts';
import { el } from '../dom.ts';
import {
  scanBlocks,
  scanCfgFields,
  scanCfgBlocks,
  mergeServerBlocks,
  resolveHitTarget,
  type BlockEntry,
  type CfgFieldEntry,
  type CfgBlockEntry,
  type ServerBlock,
} from './scanner.ts';
import {
  adminOrigin,
  pageSource,
  fetchBlocks,
  fetchAssets,
  applyBlockOp,
  uploadAsset,
  fetchPages,
  fetchPage,
  savePage,
  fetchSiteConfig,
  saveSiteConfig,
  fetchRssConfig,
  saveRssConfig,
  saveConfigField,
  type BlockOpPayload,
} from './api.ts';
import { createToolbar, isTextEditable, isInspectable, type Toolbar } from './toolbar.ts';
import { openTextEditor, type TextEditSession } from './textedit.ts';
import { createInserter, resolveInsertTarget } from './inserter.ts';
import { createInspector, gridCellSnippet } from './inspector.ts';
import { openCfgEditor, type CfgEditSession } from './cfgedit.ts';
import { renderCfgBlockForm } from './cfgpanel.ts';
import { renderPageSettings } from './pagesettings.ts';
import { createPageSwitcher } from './pageswitcher.ts';

/** hover 描边 class（样式在 overlay.css；outline 不占用布局空间） */
const HOVER_CLASS = 'oh-hover';
/** 配置坐标 hover 描边 class（虚线 + 不同颜色，与块描边区分，M12d） */
const HOVER_CFG_CLASS = 'oh-hover-cfg';
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

/** 顶栏：←后台链接（M12e）+ 徽标 + 状态（polite live region）+ 页面下拉 + ＋插入 + 页面设置 + 退出编辑 */
function createTopBar(
  t: (k: string) => string,
  statusEl: HTMLElement,
  opts: {
    switcher: HTMLElement;
    settingsEnabled: boolean;
    onInsert: () => void;
    onOpenSettings: () => void;
  }
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
  insert.addEventListener('click', opts.onInsert);
  const settings = el(
    'button',
    { class: 'oh-page-settings', type: 'button' },
    t('pageSettings')
  ) as HTMLButtonElement;
  // 无法定位当前页文件（bootstrap 未注入 __OH_PAGE_SOURCE__）时禁用
  settings.disabled = !opts.settingsEnabled;
  settings.addEventListener('click', opts.onOpenSettings);
  // 返回后台：origin 由 bootstrap 注入（未注入 = 非托管环境，不显示链接）
  const origin = adminOrigin();
  const back = el('a', { class: 'oh-back', href: origin || '#' }, t('backToAdmin'));
  return el(
    'div',
    { class: 'oh-topbar', role: 'region', 'aria-label': t('editModeBadge') },
    ...(origin ? [back] : []),
    el('span', { class: 'oh-badge' }, t('editModeBadge')),
    statusEl,
    opts.switcher,
    insert,
    settings,
    exit
  );
}

/**
 * hover 描边高亮 + 工具条锚定：命中最内层坐标（cfg 字段 > markdown 块 > cfg-block）。
 * cfg/cfg-block 用虚线描边（不出块工具条）；markdown 块照旧实线 + 浮动工具条。
 * 工具条自身上的指针不触发重锚/隐藏，移出块后短暂延迟隐藏（便于移到工具条上）。
 */
function bindHover(doc: Document, entryByEl: Map<Element, BlockEntry>, toolbar: Toolbar): void {
  let current: Element | null = null;
  let currentCls = '';
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const clearTimer = () => clearTimeout(hideTimer);
  const scheduleHide = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => toolbar.hide(), 150);
  };
  const clearCurrent = () => {
    if (current && currentCls) current.classList.remove(currentCls);
    current = null;
    currentCls = '';
  };
  toolbar.el.addEventListener('mouseenter', clearTimer);
  toolbar.el.addEventListener('mouseleave', scheduleHide);
  doc.addEventListener('mouseover', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.oh-toolbar')) return;
    const hit = resolveHitTarget(target);
    const hitEl = hit?.el ?? null;
    if (hitEl === current) return;
    clearCurrent();
    if (!hit) {
      scheduleHide();
      return;
    }
    current = hit.el;
    if (hit.type === 'src') {
      const entry = entryByEl.get(hit.el);
      if (!entry) {
        scheduleHide();
        return;
      }
      currentCls = HOVER_CLASS;
      hit.el.classList.add(HOVER_CLASS);
      clearTimer();
      toolbar.showFor(entry);
    } else {
      // cfg 字段 / cfg-block 区块：虚线描边提示可点，块工具条不适用
      currentCls = HOVER_CFG_CLASS;
      hit.el.classList.add(HOVER_CFG_CLASS);
      clearTimer();
      toolbar.hide();
    }
  });
}

/** 点击分流（§3，最内层优先）：cfg 字段 → 就地改字；cfg-block → 检查器配置表单；块 → 微编辑器/检查器 */
function bindClickToEdit(
  doc: Document,
  entryByEl: Map<Element, BlockEntry>,
  cfgByEl: Map<Element, CfgFieldEntry>,
  cfgBlockByEl: Map<Element, CfgBlockEntry>,
  openText: (entry: BlockEntry) => void,
  openInspector: (entry: BlockEntry) => void,
  openCfg: (entry: CfgFieldEntry) => void,
  openCfgBlock: (entry: CfgBlockEntry) => void
): void {
  doc.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    // overlay 自身控件不触发块编辑
    if (
      target.closest('.oh-topbar, .oh-toolbar, .oh-textedit, .oh-cfgedit, .oh-drawer, .oh-drawer-mask, .oh-inspector, .oh-inspector-mask')
    ) {
      return;
    }
    const hit = resolveHitTarget(target);
    if (!hit) return;
    if (hit.type === 'cfg') {
      const entry = cfgByEl.get(hit.el);
      if (!entry) return;
      event.preventDefault();
      openCfg(entry);
      return;
    }
    if (hit.type === 'cfgblock') {
      const entry = cfgBlockByEl.get(hit.el);
      if (!entry) return;
      event.preventDefault();
      openCfgBlock(entry);
      return;
    }
    const entry = entryByEl.get(hit.el);
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
  /** 配置字段注册表（data-oh-cfg，M12d） */
  cfgFields: CfgFieldEntry[];
  /** 配置区块注册表（data-oh-cfg-block，M12d） */
  cfgBlocks: CfgBlockEntry[];
  /** 服务端块数据合并完成（无 admin origin 时立即完成） */
  ready: Promise<void>;
}

/** 初始化 overlay：顶栏 + 块/配置注册表 + 工具条/微编辑器/插入抽屉/检查器 + hover/点击绑定 */
export function initOverlay(doc: Document): OverlayHandle {
  const t = createT(detectLang(navigator.language, readStored(LANG_KEY)));
  doc.documentElement.classList.add('oh-editing');
  const entries = scanBlocks(doc);
  const entryByEl = new Map<Element, BlockEntry>(entries.map((e) => [e.el, e]));
  // M12d：配置字段与首页配置区块注册表；hover 提示字段名/区块含义（title 仅编辑模式可见）
  const cfgFields = scanCfgFields(doc);
  const cfgByEl = new Map<Element, CfgFieldEntry>(cfgFields.map((e) => [e.el, e]));
  for (const e of cfgFields) {
    (e.el as HTMLElement).title = `${t('cfgFieldHint')}：${e.path}@${e.lang}`;
  }
  const cfgBlocks = scanCfgBlocks(doc);
  const cfgBlockByEl = new Map<Element, CfgBlockEntry>(cfgBlocks.map((e) => [e.el, e]));
  for (const e of cfgBlocks) {
    (e.el as HTMLElement).title = t('cfgBlockHint');
  }
  /** 服务端口径块列表（按文件）：同父兄弟解析/移动目标计算用 */
  const serverBlocks = new Map<string, ServerBlock[]>();

  const statusEl = el('span', { class: 'oh-status', role: 'status', 'aria-live': 'polite' });
  const setStatus = (msg: string, kind?: 'ok' | 'err'): void => {
    statusEl.textContent = msg;
    statusEl.classList.toggle('oh-err', kind === 'err');
  };

  /** 写操作统一入口：API → 成功整页刷新（§2.6）；失败顶栏报错并 rethrow（编辑面据此保持打开） */
  async function runSave(action: () => Promise<unknown>): Promise<void> {
    setStatus(t('saving'));
    try {
      await action();
    } catch (e) {
      setStatus(`${t('opFailed')}: ${(e as Error).message}`, 'err');
      throw e;
    }
    setStatus(t('saved'), 'ok');
    location.reload();
  }
  const runOp = (payload: BlockOpPayload): Promise<void> => runSave(() => applyBlockOp(payload));
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

  // ---- 右侧检查器（M12c：指令参数/grid；M12d：配置区块表单/页面设置，openPanel）----
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

  // ---- 配置字段就地改字（M12d）：当前值从服务端配置读取（渲染 HTML 与 yaml 原文不同构，
  // 如页脚内联链接），保存走 POST /api/config/field；v1 注入点全部落在 site.yaml ----
  let activeCfgEdit: CfgEditSession | null = null;
  let cfgEditSeq = 0;
  const cancelActiveCfgEdit = (): void => {
    const prev = activeCfgEdit;
    activeCfgEdit = null;
    prev?.cancel();
  };
  const loadCfgValue = async (path: string, lang: string): Promise<string> => {
    const site = await fetchSiteConfig();
    let cur: unknown = site;
    for (const seg of path.split('.')) {
      cur = stepConfigPath(cur, seg);
      if (cur === undefined) throw new Error(`配置路径不存在：${path}`);
    }
    if (typeof cur === 'string') return cur;
    if (cur && typeof cur === 'object' && !Array.isArray(cur)) {
      const obj = cur as Record<string, unknown>;
      return String(obj[lang] ?? obj.en ?? obj.zh ?? Object.values(obj)[0] ?? '');
    }
    throw new Error(`字段不是文本：${path}`);
  };
  const openCfgEditorFor = (entry: CfgFieldEntry): void => {
    cancelActiveCfgEdit();
    void cancelActiveEdit();
    inspector.close();
    toolbar.hide();
    const seq = ++cfgEditSeq;
    void (async () => {
      try {
        const session = await openCfgEditor(entry, {
          t,
          loadValue: loadCfgValue,
          onSave: (path, lang, value) =>
            runSave(() => saveConfigField({ file: 'site', path, lang, value })),
        });
        // 读取配置期间用户已点开别的编辑面 → 本次会话直接取消还原
        if (seq !== cfgEditSeq) {
          session.cancel();
          return;
        }
        activeCfgEdit = session;
      } catch (e) {
        setStatus(`${t('opFailed')}: ${(e as Error).message}`, 'err');
      }
    })();
  };

  /** 配置区块原生表单（M12d）：检查器 openPanel + configforms 共享构建器 */
  const openCfgBlockPanel = (entry: CfgBlockEntry): void => {
    cancelActiveCfgEdit();
    void cancelActiveEdit();
    toolbar.hide();
    const titles: Record<CfgBlockEntry['kind'], string> = {
      profile: t('profileSection'),
      github: t('configGithub'),
      rss: t('configRss'),
      streaming: t('streamingBlocks'),
      editorial: t('configEditorial'),
    };
    inspector.openPanel(`${titles[entry.kind]}${entry.id ? ` · ${entry.id}` : ''}`, (body) => {
      void renderCfgBlockForm(body, entry, {
        t,
        loadSite: fetchSiteConfig,
        saveSite: saveSiteConfig,
        loadRss: fetchRssConfig,
        saveRss: saveRssConfig,
        loadAssets: fetchAssets,
        adminOrigin: adminOrigin(),
        runSave,
        onCancel: () => inspector.close(),
      }).catch((e) => {
        body.replaceChildren(
          el('p', { class: 'oh-inspector-hint' }, `${t('loadFailed')}: ${(e as Error).message}`)
        );
      });
    });
  };

  /** 页面设置（M12d）：当前页由 bootstrap 注入的 pages/<lang>/<file> 定位 */
  const openPageSettings = (): void => {
    const source = pageSource();
    const m = source ? /^pages\/([^/]+)\/([^/]+\.md)$/.exec(source) : null;
    if (!m) {
      setStatus(t('opFailed'), 'err');
      return;
    }
    cancelActiveCfgEdit();
    void cancelActiveEdit();
    const [, lang, file] = m;
    inspector.openPanel(t('pageSettings'), (body) => {
      void renderPageSettings(body, {
        t,
        loadPage: () => fetchPage(lang, file),
        onSave: (frontmatter, pageBody) => runSave(() => savePage(lang, file, frontmatter, pageBody)),
        onCancel: () => inspector.close(),
      }).catch((e) => {
        body.replaceChildren(
          el('p', { class: 'oh-inspector-hint' }, `${t('loadFailed')}: ${(e as Error).message}`)
        );
      });
    });
  };

  // ---- 页面切换下拉（M12d）：跳转目标页 previewPath，编辑模式靠 sessionStorage 保持 ----
  const switcher = createPageSwitcher({
    t,
    currentSource: pageSource(),
    loadPages: fetchPages,
    navigate: (path) => {
      location.href = path;
    },
  });
  if (adminOrigin()) {
    void switcher.load().catch(() => {
      /* 页面列表加载失败：下拉留占位项，不阻断 overlay */
    });
  }

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
    cancelActiveCfgEdit();
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

  doc.body.append(
    createTopBar(t, statusEl, {
      switcher: switcher.el,
      settingsEnabled: pageSource() !== null,
      onInsert: () => inserter.open(null),
      onOpenSettings: openPageSettings,
    })
  );
  bindHover(doc, entryByEl, toolbar);
  bindClickToEdit(
    doc,
    entryByEl,
    cfgByEl,
    cfgBlockByEl,
    (entry) => void openEditor(entry),
    (entry) => {
      void cancelActiveEdit();
      inspector.open(entry);
    },
    openCfgEditorFor,
    openCfgBlockPanel
  );

  const ready = loadBlockData(entries, serverBlocks, t, setStatus);
  return { blocks: entries, cfgFields, cfgBlocks, ready };
}

// 入口自举：脚本由 bootstrap 动态插入（时序不定），等待 DOM 就绪后初始化
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initOverlay(document), { once: true });
  } else {
    initOverlay(document);
  }
}
