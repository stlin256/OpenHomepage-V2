/**
 * 流式块内容编辑窗口（M12g）：全屏遮罩 + 居中双栏弹窗——左侧 markdown 源码
 * （等宽 textarea），右侧实时预览（输入 500ms 防抖调 render 回调 →
 * POST /api/render-markdown，站点同一条渲染管线；stream/ghcard/editorial 嵌入占位
 * 在预览缺数据时被移除，已知限制——预览用于文本/排版/媒体核对）。
 * 保存 → onSave（POST /api/stream-content，调用方包 runSave：成功整页刷新）；
 * 关闭（✕/关闭按钮/点击遮罩/Esc）：有未保存改动时 confirm。Ctrl+Enter 保存。
 * 窗口打开期间页面上的流式块已是完全展开状态（编辑模式 <html class="oh-edit"> 下
 * stream-player 不播打字机），无动画冲突。z-index 高于 overlay 其他浮层
 * （overlay.css .oh-streamedit-mask）。保存/加载错误沿用顶栏 polite live region
 * （调用方 runSave/setStatus），预览错误显示在窗口内状态行（role=status）。
 */
import { el } from '../dom.ts';

export interface StreamEditDeps {
  t: (k: string) => string;
  /** 流式块 id（窗口标题展示用） */
  id: string;
  /** 读取当前内容文件（GET /api/stream-content）；失败抛错（不打开窗口） */
  load: () => Promise<{ path: string; markdown: string }>;
  /** 渲染预览 HTML（POST /api/render-markdown）；失败抛错（状态行显示，窗口保持打开） */
  render: (markdown: string) => Promise<string>;
  /** 保存（POST /api/stream-content）；抛错 = 失败（窗口保持打开，错误已在顶栏显示） */
  onSave: (markdown: string) => Promise<void>;
}

export interface StreamEditSession {
  /** 遮罩根元素（oh-streamedit-mask；测试用入口） */
  root: HTMLElement;
  save(): Promise<void>;
  /** 关闭（有未保存改动时先 confirm） */
  close(): void;
}

/** 预览渲染防抖间隔（ms） */
const PREVIEW_DEBOUNCE_MS = 500;

/** 打开流式内容编辑窗口（先异步取内容文件，再挂 DOM；load 失败则不打开） */
export async function openStreamEditor(
  doc: Document,
  deps: StreamEditDeps
): Promise<StreamEditSession> {
  const { t } = deps;
  const { markdown } = await deps.load();

  const input = el('textarea', {
    class: 'oh-streamedit-input',
    'aria-label': t('streamSourceLabel'),
    spellcheck: 'false',
  }) as HTMLTextAreaElement;
  input.value = markdown;
  const preview = el('div', {
    class: 'oh-streamedit-preview',
    role: 'region',
    'aria-label': t('streamPreviewLabel'),
  });
  preview.classList.add('markdown-body'); // 预览排版复用页面 markdown 样式
  const status = el('span', { class: 'oh-streamedit-status', role: 'status', 'aria-live': 'polite' });
  const saveBtn = el('button', { type: 'button', class: 'oh-primary' }, t('save')) as HTMLButtonElement;
  saveBtn.addEventListener('click', () => void save());
  const closeBtn = el('button', { type: 'button' }, t('close')) as HTMLButtonElement;
  closeBtn.addEventListener('click', () => close());
  const headClose = el(
    'button',
    { type: 'button', class: 'oh-streamedit-close', 'aria-label': t('close') },
    '✕'
  );
  headClose.addEventListener('click', () => close());
  const dialog = el(
    'div',
    { class: 'oh-streamedit', role: 'dialog', 'aria-label': t('streamEditorTitle') },
    el(
      'div',
      { class: 'oh-streamedit-head' },
      el('span', { class: 'oh-streamedit-title' }, `${t('streamEditorTitle')} · ${deps.id}`),
      headClose
    ),
    el('div', { class: 'oh-streamedit-main' }, input, preview),
    el('div', { class: 'oh-streamedit-ops' }, status, saveBtn, closeBtn)
  );
  const root = el('div', { class: 'oh-streamedit-mask' }, dialog);

  let closed = false;
  let busy = false;
  let timer: number | undefined;
  /** 渲染代际：防抖/乱序返回时只采纳最新一次 */
  let renderSeq = 0;
  const dirty = (): boolean => input.value !== markdown;

  async function renderPreview(value: string): Promise<void> {
    const seq = ++renderSeq;
    try {
      const html = await deps.render(value);
      if (closed || seq !== renderSeq) return; // 窗口已关 / 已有更新的渲染在途
      preview.innerHTML = html;
      status.textContent = '';
      status.classList.remove('oh-err');
    } catch (e) {
      if (closed || seq !== renderSeq) return;
      status.textContent = `${t('opFailed')}: ${(e as Error).message}`;
      status.classList.add('oh-err');
    }
  }

  function schedulePreview(): void {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = undefined;
      void renderPreview(input.value);
    }, PREVIEW_DEBOUNCE_MS);
  }

  function teardown(): void {
    if (timer !== undefined) window.clearTimeout(timer);
    doc.removeEventListener('keydown', onKeydown, true);
    root.remove();
  }

  async function save(): Promise<void> {
    if (closed || busy) return;
    busy = true;
    saveBtn.disabled = true;
    try {
      await deps.onSave(input.value);
      closed = true;
      // 成功路径调用方随即整页刷新（§2.6）；清理兜底保证幂等
      teardown();
    } catch {
      busy = false;
      saveBtn.disabled = false; // 失败：窗口保持打开，可改后重试
    }
  }

  function close(): void {
    if (closed || busy) return;
    if (dirty() && !confirm(t('confirmCloseUnsaved'))) return;
    closed = true;
    teardown();
  }

  // 捕获阶段监听：窗口在 overlay 各浮层之上，Esc 只关本窗口（stopPropagation 不外传）
  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target === input) {
      e.preventDefault();
      void save();
    }
  }

  // 点击遮罩空白处 = 关闭（有未保存改动同样先 confirm）
  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });
  input.addEventListener('input', schedulePreview);
  doc.addEventListener('keydown', onKeydown, true);
  doc.body.append(root);
  input.focus();
  void renderPreview(markdown); // 打开即渲染一次（不防抖）

  return { root, save, close };
}
