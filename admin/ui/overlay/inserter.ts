/**
 * 插入抽屉（M12b，docs/specs/12 §2.4/§3）：顶栏「＋插入」（无锚块 → 页面末尾/空页边界）
 * 与工具条「下方插入」（锚块 = 该块）共用的块选择面板。
 * 条目 = 基础块（段落/二三级标题/列表/引用/代码块/分割线）+ 全部指令
 * （admin/shared/directives.ts 的 DIRECTIVE_DEFS + INSERT_SNIPPETS；
 * 指令片段的占位参数本里程碑不管，M12c 检查器负责点开后编辑）。
 */
import { el } from '../dom.ts';
import { DIRECTIVE_DEFS, DIRECTIVE_LABEL_KEYS, INSERT_SNIPPETS } from '../../shared/directives.ts';
import type { BlockEntry } from './scanner.ts';

export interface InsertTarget {
  source: string;
  /** 锚块（插到其后，需 hash）；与 boundary 二选一 */
  anchor?: BlockEntry;
  /** 零宽边界插入 offset（无锚块：文首/空页面，服务端校验合法性，0 恒合法） */
  boundary?: number;
}

/**
 * 解析插入目标：锚块优先（无 hash = 数据未就绪，不可插）；
 * 无锚块时插到 body 末尾（该文件最后一个 root 顶层块之后）；
 * 空页面（注册表无可用块）退化为 start=end=0 边界插入；
 * 连页面文件都无法确定（无坐标也无 bootstrap 注入）→ null。
 */
export function resolveInsertTarget(
  entries: BlockEntry[],
  anchor: BlockEntry | null | undefined,
  pageSource: string | null
): InsertTarget | null {
  if (anchor) return anchor.hash ? { source: anchor.span.source, anchor } : null;
  const source = pageSource ?? entries[0]?.span.source;
  if (!source) return null;
  const roots = entries.filter((e) => e.span.source === source && e.parent === 'root' && e.hash);
  const last = roots[roots.length - 1];
  return last ? { source, anchor: last } : { source, boundary: 0 };
}

export interface InserterDeps {
  t: (k: string) => string;
  /** 选中条目：markdown 片段 + 打开时的锚块（顶栏「＋插入」为 null）；目标解析与写库由调用方负责 */
  onPick: (markdown: string, anchor: BlockEntry | null) => void;
}

export interface Inserter {
  /** 打开抽屉；anchor 为工具条「下方插入」的锚块（顶栏入口传 null） */
  open(anchor: BlockEntry | null): void;
  close(): void;
  isOpen(): boolean;
}

/** 指令块的展示名（与旧编辑器插入下拉同一套 i18n 键，映射见 shared/directives.ts） */
function directiveLabels(t: (k: string) => string): Record<string, string> {
  return Object.fromEntries(Object.entries(DIRECTIVE_LABEL_KEYS).map(([name, key]) => [name, t(key)]));
}

export function createInserter(doc: Document, deps: InserterDeps): Inserter {
  const { t } = deps;
  let anchor: BlockEntry | null = null;
  let opened = false;

  // 基础块片段：占位内容复用条目标签（用户随后就地改写）
  const basicItems: { label: string; markdown: string }[] = [
    { label: t('blkParagraph'), markdown: t('blkParagraph') },
    { label: t('blkHeading2'), markdown: `## ${t('blkHeading2')}` },
    { label: t('blkHeading3'), markdown: `### ${t('blkHeading3')}` },
    { label: t('blkBulletList'), markdown: `- ${t('blkListItem')}` },
    { label: t('blkOrderedList'), markdown: `1. ${t('blkListItem')}` },
    { label: t('blkQuote'), markdown: `> ${t('blkQuote')}` },
    { label: t('blkCode'), markdown: '```\n\n```' },
    { label: t('blkDivider'), markdown: '---' },
  ];
  const dirLabel = directiveLabels(t);
  const directiveItems: { label: string; icon: string; markdown: string }[] = [
    ...DIRECTIVE_DEFS.map((d) => ({
      label: dirLabel[d.id] ?? d.name,
      icon: d.icon,
      markdown: INSERT_SNIPPETS[d.id] ?? '',
    })),
    // grid 不在 DIRECTIVE_DEFS（容器嵌套结构），单独补一条
    { label: dirLabel.grid, icon: '▦', markdown: INSERT_SNIPPETS.grid },
  ];

  const pick = (markdown: string): void => {
    const a = anchor;
    close();
    deps.onPick(markdown, a);
  };

  const itemBtn = (label: string, markdown: string, icon?: string): HTMLElement => {
    const b = el(
      'button',
      { type: 'button', class: 'oh-drawer-item' },
      ...(icon ? [el('span', { class: 'oh-drawer-icon' }, icon)] : []),
      el('span', {}, label)
    );
    b.addEventListener('click', () => pick(markdown));
    return b;
  };

  const panel = el(
    'div',
    { class: 'oh-drawer', role: 'dialog', 'aria-label': t('insertBlock') },
    el('h3', {}, t('insertSectionBasic')),
    ...basicItems.map((it) => itemBtn(it.label, it.markdown)),
    el('h3', {}, t('insertSectionDirective')),
    ...directiveItems.map((it) => itemBtn(it.label, it.markdown, it.icon))
  );
  const mask = el('div', { class: 'oh-drawer-mask' });
  mask.addEventListener('click', () => close());
  // Esc 关闭（常驻监听，仅打开时生效）
  doc.addEventListener('keydown', (e) => {
    if (opened && e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });

  function open(a: BlockEntry | null): void {
    anchor = a;
    if (opened) return;
    opened = true;
    doc.body.append(mask, panel);
    panel.querySelector<HTMLElement>('.oh-drawer-item')?.focus();
  }
  function close(): void {
    if (!opened) return;
    opened = false;
    mask.remove();
    panel.remove();
  }

  return { open, close, isOpen: () => opened };
}
