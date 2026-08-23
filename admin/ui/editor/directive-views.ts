/**
 * 指令节点的 ProseMirror 节点视图：所见即所得预览卡 + 右上角 hover 编辑按钮。
 * - 预览尽量贴近站点渲染：ghcard 用 .cache pinned 快照画仓库卡，figure 直接显示图片
 *   （素材走 /api/asset/file），bilibili/youtube/video/audio 画播放器观感卡，
 *   stream 显示标题+内容摘要，grid 容器带可视边框与分栏。
 * - 编辑按钮（铅笔）点击展开/收起参数面板（沿用 paramInput 行），参数修改直接写回
 *   节点 attrs（文档变化 → 自动保存 → 序列化为指令语法），并即时重绘预览。
 */
import { $view } from '@milkdown/utils';
import type { Node } from '@milkdown/prose/model';
import type { EditorView, NodeView, NodeViewConstructor, ViewMutationRecord } from '@milkdown/prose/view';
import { DIRECTIVE_DEFS, directiveAtomNodes, gridNode, gridCellNode } from './directive-nodes.ts';
import { api, type DirectivePreviewData } from '../api.ts';

type T = (key: string) => string;
type Attrs = Record<string, string>;

/** 预览数据加载器（测试可注入替身；真实环境走 admin server API） */
export type PreviewLoader = () => Promise<DirectivePreviewData>;

const EMPTY_PREVIEW: DirectivePreviewData = { pinned: [], streams: [] };

const defaultLoader: PreviewLoader = async () => {
  try {
    return await api.directivePreview();
  } catch {
    return EMPTY_PREVIEW;
  }
};

const EDIT_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
  '<path d="M3 17.25V21h3.75L17.81 8.94l-3.75-3.75L3 17.25z"/>' +
  '<path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>' +
  '</svg>';

/** 素材引用 → 编辑器可加载的 URL：assets/ 前缀走素材 API，外链原样 */
export function assetUrl(src: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  return `/api/asset/file?name=${encodeURIComponent(src.replace(/^assets\//, ''))}`;
}

const WIDTH_RE = /^[\d.]+(%|px|em|rem|vw)$/;

function basename(p: string): string {
  return p.split('/').pop() ?? p;
}

/** 16:9 播放器观感卡（bilibili/youtube/video 共用）：徽标 + 中央播放三角 + 参数行 */
function playerCard(badge: string, badgeClass: string, label: string, poster?: string): HTMLElement {
  const box = document.createElement('div');
  box.className = 'dp-player';
  const badgeEl = document.createElement('span');
  badgeEl.className = `dp-badge ${badgeClass}`;
  badgeEl.textContent = badge;
  const play = document.createElement('span');
  play.className = 'dp-play';
  play.textContent = '▶';
  box.append(badgeEl, play);
  if (poster) {
    const img = document.createElement('img');
    img.className = 'dp-poster';
    img.src = assetUrl(poster);
    img.alt = '';
    box.append(img);
  }
  const wrap = document.createElement('div');
  const meta = document.createElement('div');
  meta.className = 'dp-meta';
  meta.textContent = label;
  wrap.append(box, meta);
  return wrap;
}

/**
 * 按指令类型把预览渲染进 container（每次调用先清空）。
 * values 为指令参数；data 为预览数据（pinned/stream 快照，可能为空）。
 */
export function renderDirectivePreview(
  container: HTMLElement,
  name: string,
  values: Attrs,
  data: DirectivePreviewData,
  t: T
): void {
  const el = (tag: string, className: string, text = ''): HTMLElement => {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  container.replaceChildren();
  switch (name) {
    case 'bilibili':
      container.append(playerCard('bilibili', 'dp-badge-bilibili', values.bvid || 'bvid?'));
      return;
    case 'youtube':
      container.append(playerCard('YouTube', 'dp-badge-youtube', values.id || 'id?'));
      return;
    case 'video': {
      const src = values.src ?? '';
      container.append(
        playerCard('video', 'dp-badge-video', src ? basename(src) : t('previewNoMedia'), values.poster || undefined)
      );
      return;
    }
    case 'audio': {
      const bar = el('div', 'dp-audio');
      bar.append(el('span', 'dp-audio-icon', '🎵'));
      bar.append(el('span', 'dp-audio-name', values.src ? basename(values.src) : t('previewNoMedia')));
      bar.append(el('span', 'dp-audio-bar'));
      container.append(bar);
      return;
    }
    case 'figure': {
      const fig = el('figure', 'dp-figure');
      if (values.width && WIDTH_RE.test(values.width)) fig.style.width = values.width;
      if (values.align === 'center') fig.style.margin = '0 auto';
      else if (values.align === 'right') fig.style.marginLeft = 'auto';
      else if (values.align === 'left') fig.style.marginRight = 'auto';
      if (values.src) {
        const img = document.createElement('img');
        img.src = assetUrl(values.src);
        img.alt = values.caption ?? '';
        fig.append(img);
      } else {
        fig.append(el('div', 'dp-placeholder', t('previewNoImage')));
      }
      if (values.caption) fig.append(el('figcaption', 'dp-caption', values.caption));
      container.append(fig);
      return;
    }
    case 'ghcard': {
      const repoName = (values.repo ?? '').toLowerCase();
      const repo = data.pinned.find((r) => r.full_name.toLowerCase() === repoName);
      const card = el('div', 'dp-ghrepo');
      card.append(el('span', 'dp-ghrepo-name', values.repo || 'owner/repo'));
      if (repo) {
        const desc = repo.note ?? repo.description ?? '';
        if (desc) card.append(el('span', 'dp-ghrepo-desc', desc));
        const meta: string[] = [];
        if (repo.language) meta.push(repo.language);
        if (repo.stargazers_count !== undefined) meta.push(`★ ${repo.stargazers_count}`);
        if (repo.forks_count !== undefined) meta.push(`⑂ ${repo.forks_count}`);
        if (meta.length) card.append(el('span', 'dp-ghrepo-meta', meta.join(' · ')));
      } else {
        card.append(el('span', 'dp-ghrepo-desc', t('ghcardNotPinned')));
      }
      container.append(card);
      return;
    }
    case 'stream': {
      const block = data.streams.find((s) => s.id === values.id);
      const card = el('div', 'dp-stream');
      card.append(el('div', 'dp-stream-head', `💬 ${block?.title || values.id || 'stream'}`));
      card.append(
        el('div', 'dp-stream-excerpt', block ? block.excerpt : t('streamUnknown'))
      );
      container.append(card);
      return;
    }
    default:
      container.append(el('div', 'dp-meta', name));
  }
}

function paramInput(
  label: string,
  value: string,
  placeholder: string | undefined,
  onInput: (v: string) => void,
  options?: string[]
): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'directive-param';
  const span = document.createElement('span');
  span.textContent = label;
  let control: HTMLElement;
  if (options) {
    // 固定取值集合（如 figure align）用下拉选择，避免手误；空串 = 未设置
    const sel = document.createElement('select');
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '—';
    sel.append(empty);
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      sel.append(opt);
    }
    sel.value = value;
    sel.addEventListener('change', () => onInput(sel.value));
    control = sel;
  } else {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    if (placeholder) input.placeholder = placeholder;
    input.addEventListener('input', () => onInput(input.value));
    control = input;
  }
  wrap.append(span, control);
  return wrap;
}

class AtomCardView implements NodeView {
  dom: HTMLElement;
  private node: Node;
  private preview: HTMLElement;
  private params: HTMLElement;
  private previewData = EMPTY_PREVIEW;
  constructor(
    node: Node,
    private view: EditorView,
    private getPos: () => number | undefined,
    private defIndex: number,
    private t: T,
    load: PreviewLoader
  ) {
    this.node = node;
    const def = DIRECTIVE_DEFS[defIndex];
    this.dom = document.createElement('div');
    this.dom.className = `directive-card directive-card-${def.name}`;
    this.dom.contentEditable = 'false';

    // 右上角编辑按钮（hover 显示；点击展开/收起参数面板）
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'directive-edit';
    editBtn.title = t('editDirective');
    editBtn.setAttribute('aria-label', t('editDirective'));
    editBtn.innerHTML = EDIT_ICON;
    editBtn.addEventListener('click', () => {
      this.params.classList.toggle('open');
      editBtn.classList.toggle('active');
    });
    this.dom.append(editBtn);

    // 所见即所得预览（ghcard/stream 的数据到达后重绘）
    this.preview = document.createElement('div');
    this.preview.className = 'directive-preview';
    this.dom.append(this.preview);
    this.renderPreview();
    if (def.name === 'ghcard' || def.name === 'stream') {
      void load().then((data) => {
        this.previewData = data;
        this.renderPreview();
      });
    }

    // 参数面板（默认收起；编辑按钮展开）
    this.params = document.createElement('div');
    this.params.className = 'directive-params';
    const head = document.createElement('div');
    head.className = 'directive-card-head';
    head.textContent = `${def.icon} ${def.name}`;
    this.params.append(head);
    const body = document.createElement('div');
    body.className = 'directive-card-body';
    for (const p of def.params) {
      body.append(
        paramInput(
          p.label,
          String(node.attrs.values[p.key] ?? ''),
          p.placeholder,
          (v) => this.updateParam(p.key, v),
          p.options
        )
      );
    }
    this.params.append(body);
    this.dom.append(this.params);
  }

  private renderPreview() {
    renderDirectivePreview(
      this.preview,
      DIRECTIVE_DEFS[this.defIndex].name,
      this.node.attrs.values as Attrs,
      this.previewData,
      this.t
    );
  }

  private updateParam(key: string, value: string) {
    const pos = this.getPos();
    if (pos === undefined) return;
    const values = { ...this.node.attrs.values, [key]: value };
    if (!value) delete values[key];
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, values })
    );
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false;
    // 外部变更（如撤销）：同步输入框/下拉框，但不打断正在输入的焦点
    const def = DIRECTIVE_DEFS[this.defIndex];
    const controls = this.params.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      '.directive-param input, .directive-param select'
    );
    controls.forEach((control, i) => {
      const v = String(node.attrs.values[def.params[i].key] ?? '');
      if (document.activeElement !== control && control.value !== v) control.value = v;
    });
    this.node = node;
    this.renderPreview(); // 参数变化即时重绘预览
    return true;
  }

  stopEvent(event: Event): boolean {
    return (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLButtonElement
    );
  }

  ignoreMutation(): boolean {
    return true;
  }
}

class GridView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private node: Node;
  constructor(
    node: Node,
    private view: EditorView,
    private getPos: () => number | undefined,
    t: T
  ) {
    this.node = node;
    this.dom = document.createElement('div');
    this.dom.className = 'directive-grid-editor';
    const head = document.createElement('div');
    head.className = 'directive-card-head';
    head.contentEditable = 'false';
    head.textContent = `▦ grid`;
    head.append(
      paramInput('cols', String(node.attrs.values.cols ?? '2'), '2', (v) => {
        const pos = this.getPos();
        if (pos === undefined) return;
        const values = { ...this.node.attrs.values, cols: v };
        if (!v) delete values.cols;
        this.view.dispatch(
          this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, values })
        );
      })
    );
    this.dom.append(head);
    this.contentDOM = document.createElement('div');
    this.contentDOM.className = 'directive-grid-cells';
    this.applyCols();
    this.dom.append(this.contentDOM);
  }

  /** 栏布局：按 cols 参数给单元格容器设 grid 列数（可视边框在 CSS） */
  private applyCols() {
    const cols = Number(this.node.attrs.values.cols);
    this.contentDOM.style.gridTemplateColumns =
      Number.isInteger(cols) && cols >= 1 && cols <= 12 ? `repeat(${cols}, 1fr)` : 'repeat(2, 1fr)';
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.applyCols();
    return true;
  }

  stopEvent(event: Event): boolean {
    return event.target instanceof HTMLInputElement;
  }

  ignoreMutation(m: ViewMutationRecord): boolean {
    return !this.contentDOM.contains(m.target);
  }
}

class CellView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  constructor() {
    this.dom = document.createElement('div');
    this.dom.className = 'directive-cell-editor';
    this.contentDOM = this.dom;
  }
}

/** 全部指令节点视图（t 用于卡片内文案；load 可注入预览数据替身用于测试） */
export function createDirectiveViews(t: T, load: PreviewLoader = defaultLoader): unknown[] {
  // 预览数据共享一次加载（多张 ghcard/stream 卡片不重复请求）；失败降级为空数据
  let cache: Promise<DirectivePreviewData> | null = null;
  const loadOnce = () => (cache ??= load().catch(() => EMPTY_PREVIEW));
  const views = DIRECTIVE_DEFS.map((def, i) =>
    $view(directiveAtomNodes[i].node, (): NodeViewConstructor => {
      return (node, view, getPos) =>
        new AtomCardView(node, view, getPos as () => number | undefined, i, t, loadOnce);
    })
  );
  views.push(
    $view(gridNode.node, (): NodeViewConstructor => {
      return (node, view, getPos) =>
        new GridView(node, view, getPos as () => number | undefined, t);
    })
  );
  views.push(
    $view(gridCellNode.node, (): NodeViewConstructor => {
      return () => new CellView();
    })
  );
  return views;
}
