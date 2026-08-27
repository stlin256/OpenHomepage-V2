/**
 * 右侧检查器（M12c，docs/specs/12 §2.4/§3）：点击指令块（或工具条「编辑」）右侧滑出面板，
 * overlay 层 fixed 定位，不动页面布局；Esc / × 按钮 / 点击遮罩关闭。
 * - 指令参数表单：按 DIRECTIVE_DEFS[name] 的字段定义生成（options → 固定取值下拉，
 *   asset → 素材下拉（GET /api/assets 的引用值列表），其余文本框；labelKey 走 i18n 字典）。
 *   初值 = 服务端下发的块属性表（GET /api/page/blocks 的 attrs，与序列化严格往返）。
 *   保存 → onSaveAttrs（op:'attrs'，带 hash 防陈旧写）；空值字段不写回（删键），
 *   未在字段定义内的既有键原样保留（与旧编辑器 updateParam 同语义）。
 * - grid 检查器：列数输入（1-12 ↔ {cols=N}，非法/空 = 移除 cols，与渲染端「非法值忽略」
 *   同口径）走同一 attrs 保存；单元格列表（删除 → onDeleteCell）+「添加单元格」
 *   （→ onAddCell，insert into op；空 grid 同样可加第一个 cell，服务端定位容器内插入点）。
 * cell 无参数，不开检查器（cell 内块照常走各自路径）。
 */
import { el } from '../dom.ts';
import { DIRECTIVE_DEFS, DIRECTIVE_LABEL_KEYS } from '../../shared/directives.ts';
import type { BlockEntry, ServerBlock } from './scanner.ts';

export interface InspectorDeps {
  t: (k: string) => string;
  /** 素材引用值列表加载（asset 字段下拉；缺省/失败降级为空列表，仅保留当前值选项） */
  loadAssets?: () => Promise<string[]>;
  /** grid 的单元格块（服务端口径，源码序） */
  cellsOf?: (grid: BlockEntry) => ServerBlock[];
  /** 保存属性表（op:'attrs'）；抛错 = 失败（面板保持打开，错误由顶栏显示） */
  onSaveAttrs: (entry: BlockEntry, attrs: Record<string, string>) => Promise<void>;
  /** 删除单元格（delete op；确认交互由调用方负责，grid 用于定位文件路径） */
  onDeleteCell: (cell: ServerBlock, grid: BlockEntry) => void;
  /** 添加单元格（insert into op；片段组装与写库由调用方负责） */
  onAddCell: (grid: BlockEntry) => void;
}

export interface Inspector {
  /** 打开（或切换到）指定指令块的检查器；重复打开即重渲染面板内容 */
  open(entry: BlockEntry): void;
  close(): void;
  isOpen(): boolean;
}

/** 新单元格片段：围栏冒号数 = grid 围栏数 − 1（至少 3，spec 03 嵌套规则），从 grid 块原文推断 */
export function gridCellSnippet(gridMarkdown: string): string {
  const m = /^:{3,}/.exec(gridMarkdown);
  const fence = ':'.repeat(Math.max(3, (m?.[0].length ?? 4) - 1));
  return `${fence}cell\n\n${fence}`;
}

/** 指令块标题（图标 + 展示名；未知名回退指令名本身） */
function directiveTitle(t: (k: string) => string, name: string, icon?: string): string {
  const key = DIRECTIVE_LABEL_KEYS[name];
  const label = key ? t(key) : name;
  return icon ? `${icon} ${label}` : label;
}

/** 表单字段句柄：read 返回当前值（空串 = 未设置，保存时删键） */
interface FieldHandle {
  key: string;
  read(): string;
}

export function createInspector(doc: Document, deps: InspectorDeps): Inspector {
  const { t } = deps;
  let opened = false;
  let busy = false;

  const closeBtn = el('button', { type: 'button', class: 'oh-inspector-close', 'aria-label': t('close') }, '✕');
  closeBtn.addEventListener('click', () => close());
  const head = el('div', { class: 'oh-inspector-head' });
  const body = el('div', { class: 'oh-inspector-body' });
  const panel = el(
    'div',
    { class: 'oh-inspector', role: 'dialog', 'aria-label': t('editParams') },
    head,
    body
  );
  const mask = el('div', { class: 'oh-inspector-mask' });
  mask.addEventListener('click', () => close());
  // Esc 关闭（常驻监听，仅打开时生效）
  doc.addEventListener('keydown', (e) => {
    if (opened && e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });

  /** 固定取值/当前值下拉（options 之外的当前值保留为附加选项，避免打开表单丢值） */
  function selectControl(options: string[], current: string): HTMLSelectElement {
    const sel = el('select', { class: 'oh-input' }) as HTMLSelectElement;
    const values = ['', ...options];
    if (current !== '' && !values.includes(current)) values.push(current);
    sel.replaceChildren(
      ...values.map((v) => el('option', { value: v }, v === '' ? '—' : v) as HTMLOptionElement)
    );
    sel.value = current;
    return sel;
  }

  /** 素材下拉：空项 + 当前值（不在素材列表时保留，如外链）+ 素材引用列表（异步填充，填充后保持选中） */
  function assetControl(current: string): HTMLSelectElement {
    const sel = el('select', { class: 'oh-input' }) as HTMLSelectElement;
    const fill = (assets: string[]): void => {
      const values = ['', ...(current !== '' && !assets.includes(current) ? [current] : []), ...assets];
      sel.replaceChildren(
        ...values.map((v) => el('option', { value: v }, v === '' ? '—' : v) as HTMLOptionElement)
      );
      sel.value = current;
    };
    fill([]);
    void deps
      .loadAssets?.()
      .then(fill)
      .catch(() => {
        /* 素材列表加载失败：保留当前值选项，不影响其他字段 */
      });
    return sel;
  }

  /** 参数行：按字段定义选择控件（options 下拉 / asset 素材下拉 / 文本框） */
  function paramRow(
    p: { key: string; label: string; labelKey?: string; placeholder?: string; options?: string[]; asset?: boolean },
    value: string
  ): { row: HTMLElement; field: FieldHandle } {
    let control: HTMLInputElement | HTMLSelectElement;
    if (p.options) {
      control = selectControl(p.options, value);
    } else if (p.asset) {
      control = assetControl(value);
    } else {
      control = el('input', { type: 'text', class: 'oh-input' }) as HTMLInputElement;
      control.value = value;
      if (p.placeholder) control.placeholder = p.placeholder;
    }
    const label = p.labelKey ? t(p.labelKey) : p.label;
    const row = el('label', { class: 'oh-field' }, el('span', { class: 'oh-field-label' }, label), control);
    return { row, field: { key: p.key, read: () => control.value } };
  }

  /** 保存：合并既有键 + 收集表单（空值删键）→ onSaveAttrs；失败面板保持打开 */
  async function save(entry: BlockEntry, fields: FieldHandle[]): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const attrs: Record<string, string> = { ...(entry.attrs ?? {}) };
      for (const f of fields) {
        const v = f.read();
        if (v === '') delete attrs[f.key];
        else attrs[f.key] = v;
      }
      await deps.onSaveAttrs(entry, attrs);
      close(); // 成功路径调用方随即整页刷新（§2.6），关闭仅作状态兜底
    } catch {
      /* 失败（如 hash 陈旧 409）：面板保持打开，错误已在顶栏显示 */
    } finally {
      busy = false;
    }
  }

  /** 操作条：保存（主按钮）+ 取消（关闭面板） */
  function opsRow(entry: BlockEntry, fields: FieldHandle[]): HTMLElement {
    const saveBtn = el('button', { type: 'button', class: 'oh-primary' }, t('save')) as HTMLButtonElement;
    saveBtn.addEventListener('click', () => void save(entry, fields));
    const cancelBtn = el('button', { type: 'button' }, t('cancel')) as HTMLButtonElement;
    cancelBtn.addEventListener('click', () => close());
    return el('div', { class: 'oh-inspector-ops' }, saveBtn, cancelBtn);
  }

  /** grid 检查器：列数（1-12 ↔ {cols=N}）+ 单元格增删 */
  function renderGrid(entry: BlockEntry): void {
    const cols = el('input', {
      type: 'number',
      class: 'oh-input',
      min: '1',
      max: '12',
      step: '1',
    }) as HTMLInputElement;
    cols.value = String(entry.attrs?.cols ?? '');
    const colsField: FieldHandle = {
      key: 'cols',
      // 非法/空 = 移除 cols（渲染端对非法值同样忽略，回退默认列数）
      read: () => {
        const n = Number(cols.value);
        return Number.isInteger(n) && n >= 1 && n <= 12 ? String(n) : '';
      },
    };
    const colsRow = el(
      'label',
      { class: 'oh-field' },
      el('span', { class: 'oh-field-label' }, t('gridCols')),
      cols
    );

    const cells = deps.cellsOf?.(entry) ?? [];
    const cellRows = cells.map((cell, i) => {
      const del = el('button', { type: 'button', class: 'oh-danger' }, t('remove')) as HTMLButtonElement;
      del.addEventListener('click', () => deps.onDeleteCell(cell, entry));
      return el(
        'div',
        { class: 'oh-cell-row' },
        el('span', { class: 'oh-cell-label' }, `${t('cellLabel')} ${i + 1}`),
        del
      );
    });
    const addBtn = el('button', { type: 'button', class: 'oh-add-cell' }, t('addCell')) as HTMLButtonElement;
    addBtn.addEventListener('click', () => deps.onAddCell(entry));

    body.replaceChildren(
      colsRow,
      opsRow(entry, [colsField]),
      el('h3', {}, t('gridCells')),
      ...(cells.length > 0
        ? cellRows
        : [el('p', { class: 'oh-inspector-hint' }, t('noCells'))]),
      addBtn
    );
  }

  /** 常规指令检查器：按 DIRECTIVE_DEFS 字段定义生成参数表单 */
  function renderParams(entry: BlockEntry, def: (typeof DIRECTIVE_DEFS)[number]): void {
    const attrs = entry.attrs ?? {};
    const built = def.params.map((p) => paramRow(p, String(attrs[p.key] ?? '')));
    body.replaceChildren(...built.map((b) => b.row), opsRow(entry, built.map((b) => b.field)));
  }

  function render(entry: BlockEntry): void {
    const name = entry.name ?? '';
    const def = DIRECTIVE_DEFS.find((d) => d.name === name);
    head.replaceChildren(
      el('span', { class: 'oh-inspector-title' }, directiveTitle(t, name, def?.icon ?? (name === 'grid' ? '▦' : undefined))),
      closeBtn
    );
    if (name === 'grid') renderGrid(entry);
    else if (def) renderParams(entry, def);
    else body.replaceChildren(el('p', { class: 'oh-inspector-hint' }, t('editUnsupported')));
  }

  function open(entry: BlockEntry): void {
    render(entry);
    if (opened) return;
    opened = true;
    doc.body.append(mask, panel);
  }
  function close(): void {
    if (!opened) return;
    opened = false;
    mask.remove();
    panel.remove();
  }

  return { open, close, isOpen: () => opened };
}
