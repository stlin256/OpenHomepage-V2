/**
 * 右侧检查器（admin/ui/overlay/inspector.ts，M12c）jsdom 测试：
 * 打开指令块 → 参数表单初值 = 服务端下发的块属性表；保存合并收集（空值删键、
 * 未定义键保留）→ onSaveAttrs；options/asset 字段渲染为下拉（素材列表异步填充）；
 * grid 检查器（列数校验、单元格列表增删回调、空 grid 提示）；Esc/遮罩/× 关闭；
 * 保存失败面板保持打开；gridCellSnippet 围栏冒号数推断。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createInspector, gridCellSnippet, type InspectorDeps } from '../admin/ui/overlay/inspector.ts';
import type { BlockEntry, ServerBlock } from '../admin/ui/overlay/scanner.ts';
import { createT } from '../admin/shared/i18n.ts';

const t = createT('zh');
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

/** 造一个带服务端数据的指令块 */
function dirEntry(
  name: string,
  kind: 'leaf' | 'container',
  attrs: Record<string, string>,
  markdown = ''
): BlockEntry {
  const el = document.createElement('div');
  document.body.append(el);
  return {
    el,
    span: { source: 'pages/zh/index.md', start: 0, end: 10 },
    kind: kind === 'leaf' ? 'leafDirective' : 'containerDirective',
    name,
    parent: 'root',
    hash: 'h',
    markdown,
    attrs,
  };
}

function cellBlock(start: number): ServerBlock {
  return {
    start,
    end: start + 10,
    kind: 'containerDirective',
    name: 'cell',
    parent: '0:10',
    hash: `h${start}`,
    markdown: ':::cell\n\n:::',
    attrs: {},
  };
}

function makeDeps(overrides: Partial<InspectorDeps> = {}): InspectorDeps & {
  onSaveAttrs: ReturnType<typeof vi.fn>;
  onDeleteCell: ReturnType<typeof vi.fn>;
  onAddCell: ReturnType<typeof vi.fn>;
} {
  return {
    t,
    onSaveAttrs: vi.fn(async () => {}),
    onDeleteCell: vi.fn(),
    onAddCell: vi.fn(),
    ...overrides,
  };
}

const panel = () => document.querySelector('.oh-inspector') as HTMLElement | null;
const inputs = () =>
  Array.from(document.querySelectorAll('.oh-inspector .oh-field .oh-input')) as (
    | HTMLInputElement
    | HTMLSelectElement
  )[];
const saveBtn = () =>
  document.querySelector('.oh-inspector-ops .oh-primary') as HTMLButtonElement;

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('inspector：指令参数表单', () => {
  it('打开 stream 块：表单初值 = 块属性表；改值保存合并收集', async () => {
    const deps = makeDeps();
    const insp = createInspector(document, deps);
    const entry = dirEntry('stream', 'leaf', { id: 'welcome' });
    insp.open(entry);
    expect(insp.isOpen()).toBe(true);
    // 标题含指令展示名
    expect(panel()!.querySelector('.oh-inspector-title')!.textContent).toContain(t('dirStream'));
    const [input] = inputs() as HTMLInputElement[];
    expect(input.value).toBe('welcome');
    input.value = 'news';
    saveBtn().click();
    await tick();
    expect(deps.onSaveAttrs).toHaveBeenCalledWith(entry, { id: 'news' });
    expect(insp.isOpen()).toBe(false); // 成功后关闭
  });

  it('空值字段删键；未在字段定义内的既有键原样保留', async () => {
    const deps = makeDeps();
    const insp = createInspector(document, deps);
    // figure 定义内 src/caption/width/align + 定义外自定义键 custom
    const entry = dirEntry('figure', 'container', {
      src: 'assets/a.jpg',
      caption: '图 1',
      custom: 'keep',
    });
    insp.open(entry);
    const [src, caption] = inputs() as (HTMLInputElement | HTMLSelectElement)[];
    expect(src.value).toBe('assets/a.jpg');
    expect(caption.value).toBe('图 1');
    caption.value = ''; // 清空 caption → 保存时删键
    saveBtn().click();
    await tick();
    expect(deps.onSaveAttrs).toHaveBeenCalledWith(entry, { src: 'assets/a.jpg', custom: 'keep' });
  });

  it('options 字段（figure align）渲染固定取值下拉，初值选中', async () => {
    const deps = makeDeps();
    const insp = createInspector(document, deps);
    insp.open(dirEntry('figure', 'container', { src: 'assets/a.jpg', align: 'right' }));
    const alignSel = inputs()[3] as HTMLSelectElement; // src/caption/width/align
    expect(alignSel.tagName).toBe('SELECT');
    expect(alignSel.value).toBe('right');
    alignSel.value = 'center';
    saveBtn().click();
    await tick();
    expect(deps.onSaveAttrs).toHaveBeenCalledWith(expect.anything(), {
      src: 'assets/a.jpg',
      align: 'center',
    });
  });

  it('asset 字段（figure src）渲染素材下拉：列表异步填充，当前值（外链）保留', async () => {
    const deps = makeDeps({
      loadAssets: vi.fn(async () => ['assets/a.jpg', 'assets/b.png']),
    });
    const insp = createInspector(document, deps);
    insp.open(dirEntry('figure', 'container', { src: 'https://e.com/x.jpg' }));
    await tick(); // 等素材列表填充
    const srcSel = inputs()[0] as HTMLSelectElement;
    expect(srcSel.tagName).toBe('SELECT');
    const values = Array.from(srcSel.options).map((o) => o.value);
    expect(values).toContain('assets/a.jpg');
    expect(values).toContain('assets/b.png');
    expect(values).toContain('https://e.com/x.jpg'); // 当前值不在素材列表也保留
    expect(srcSel.value).toBe('https://e.com/x.jpg');
    srcSel.value = 'assets/b.png';
    saveBtn().click();
    await tick();
    expect(deps.onSaveAttrs).toHaveBeenCalledWith(expect.anything(), { src: 'assets/b.png' });
  });

  it('保存失败（onSaveAttrs 抛错）：面板保持打开', async () => {
    const deps = makeDeps({
      onSaveAttrs: vi.fn(async () => {
        throw new Error('块内容已被修改（hash 不一致），请刷新后重试');
      }),
    });
    const insp = createInspector(document, deps);
    insp.open(dirEntry('stream', 'leaf', { id: 'welcome' }));
    saveBtn().click();
    await tick();
    expect(deps.onSaveAttrs).toHaveBeenCalledTimes(1);
    expect(insp.isOpen()).toBe(true);
  });
});

describe('inspector：grid 检查器', () => {
  function gridEntry(attrs: Record<string, string>, markdown = '::::grid{cols=2}\n::::'): BlockEntry {
    return dirEntry('grid', 'container', attrs, markdown);
  }

  it('列数初值 + 单元格列表渲染；改列数保存走 onSaveAttrs', async () => {
    const deps = makeDeps({ cellsOf: () => [cellBlock(10), cellBlock(30)] });
    const insp = createInspector(document, deps);
    insp.open(gridEntry({ cols: '2' }));
    expect(panel()!.querySelector('.oh-inspector-title')!.textContent).toContain(t('dirGrid'));
    const cols = inputs()[0] as HTMLInputElement;
    expect(cols.value).toBe('2');
    // 两个单元格行（序号 + 删除按钮）
    const rows = Array.from(document.querySelectorAll('.oh-cell-row'));
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain(`${t('cellLabel')} 1`);
    cols.value = '3';
    saveBtn().click();
    await tick();
    expect(deps.onSaveAttrs).toHaveBeenCalledWith(expect.anything(), { cols: '3' });
  });

  it('列数非法/空 → 保存时移除 cols 键（与渲染端非法值忽略同口径）', async () => {
    const deps = makeDeps({ cellsOf: () => [] });
    const insp = createInspector(document, deps);
    insp.open(gridEntry({ cols: '2' }));
    (inputs()[0] as HTMLInputElement).value = '13';
    saveBtn().click();
    await tick();
    expect(deps.onSaveAttrs).toHaveBeenCalledWith(expect.anything(), {});
  });

  it('空 grid 显示提示；添加单元格回调携带 grid 块', () => {
    const deps = makeDeps({ cellsOf: () => [] });
    const insp = createInspector(document, deps);
    const grid = gridEntry({ cols: '2' });
    insp.open(grid);
    expect(panel()!.textContent).toContain(t('noCells'));
    (document.querySelector('.oh-add-cell') as HTMLButtonElement).click();
    expect(deps.onAddCell).toHaveBeenCalledWith(grid);
  });

  it('删除单元格：回调携带对应 cell 块', () => {
    const cells = [cellBlock(10), cellBlock(30)];
    const deps = makeDeps({ cellsOf: () => cells });
    const insp = createInspector(document, deps);
    insp.open(gridEntry({ cols: '2' }));
    const delBtns = Array.from(
      document.querySelectorAll('.oh-cell-row .oh-danger')
    ) as HTMLButtonElement[];
    delBtns[1].click();
    expect(deps.onDeleteCell).toHaveBeenCalledWith(cells[1], expect.anything());
  });
});

describe('inspector：关闭交互', () => {
  it('Esc / 点击遮罩 / × 按钮关闭', () => {
    const deps = makeDeps();
    const insp = createInspector(document, deps);
    const entry = dirEntry('stream', 'leaf', { id: 'x' });
    insp.open(entry);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(insp.isOpen()).toBe(false);
    expect(panel()).toBeNull();

    insp.open(entry);
    (document.querySelector('.oh-inspector-mask') as HTMLElement).click();
    expect(insp.isOpen()).toBe(false);

    insp.open(entry);
    (document.querySelector('.oh-inspector-close') as HTMLElement).click();
    expect(insp.isOpen()).toBe(false);
  });

  it('重复打开切换目标块（内容重渲染）', () => {
    const deps = makeDeps();
    const insp = createInspector(document, deps);
    insp.open(dirEntry('stream', 'leaf', { id: 'a' }));
    insp.open(dirEntry('ghcard', 'leaf', { repo: 'o/r' }));
    expect(panel()!.querySelector('.oh-inspector-title')!.textContent).toContain(t('dirGhcard'));
    expect((inputs()[0] as HTMLInputElement).value).toBe('o/r');
  });
});

describe('gridCellSnippet：新单元格片段', () => {
  it('围栏冒号数 = grid 围栏数 − 1（至少 3）', () => {
    expect(gridCellSnippet('::::grid{cols=2}\n::::')).toBe(':::cell\n\n:::');
    expect(gridCellSnippet(':::::grid\n:::::')).toBe('::::cell\n\n::::');
    expect(gridCellSnippet(':::grid\n:::')).toBe(':::cell\n\n:::');
    // 无原文（异常兜底）按 4 冒号 grid 推断
    expect(gridCellSnippet('')).toBe(':::cell\n\n:::');
  });
});
