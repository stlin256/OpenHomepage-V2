/**
 * 插入抽屉（admin/ui/overlay/inserter.ts，M12b）jsdom 测试：
 * resolveInsertTarget 目标解析（锚块 / 顶栏无锚块 → 页面最后一块之后 / 空页边界 0）；
 * 抽屉渲染基础块 + 全部指令条目（DIRECTIVE_DEFS + grid），点击回传片段与锚块，Esc/遮罩关闭。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createInserter, resolveInsertTarget, locateInsertedBlock } from '../admin/ui/overlay/inserter.ts';
import { DIRECTIVE_DEFS, INSERT_SNIPPETS } from '../admin/shared/directives.ts';
import type { BlockEntry, ServerBlock } from '../admin/ui/overlay/scanner.ts';
import { createT } from '../admin/shared/i18n.ts';

const t = createT('zh');

function entry(
  start: number,
  end: number,
  extra: Partial<BlockEntry> = {}
): BlockEntry {
  const el = document.createElement('p');
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

describe('resolveInsertTarget：插入目标解析', () => {
  it('锚块优先：插在锚块之后（需 hash；无 hash = 数据未就绪 → null）', () => {
    const anchor = entry(7, 10);
    expect(resolveInsertTarget([anchor], anchor, 'pages/zh/index.md')).toEqual({
      source: 'pages/zh/index.md',
      anchor,
    });
    const noHash = entry(7, 10, { hash: undefined });
    expect(resolveInsertTarget([noHash], noHash, 'pages/zh/index.md')).toBeNull();
  });

  it('顶栏无锚块：插到页面最后一个 root 顶层块之后（跳过嵌套块与未匹配块）', () => {
    const a = entry(0, 5);
    const grid = entry(7, 60);
    const inner = entry(20, 25, { parent: '7:60' }); // cell 内块不算顶层
    const stale = entry(100, 105, { hash: undefined }); // 未匹配服务端，不作锚
    const entries = [a, grid, inner, stale];
    const target = resolveInsertTarget(entries, null, 'pages/zh/index.md');
    expect(target).toEqual({ source: 'pages/zh/index.md', anchor: grid });
  });

  it('空页面：start=end=0 边界插入（页面文件由 bootstrap 注入）', () => {
    expect(resolveInsertTarget([], null, 'pages/zh/index.md')).toEqual({
      source: 'pages/zh/index.md',
      boundary: 0,
    });
  });

  it('pageSource 缺失时回退到注册表首个 fileRef；两者皆无 → null', () => {
    const a = entry(0, 5);
    expect(resolveInsertTarget([a], null, null)).toEqual({
      source: 'pages/zh/index.md',
      anchor: a,
    });
    expect(resolveInsertTarget([], null, null)).toBeNull();
  });
});

describe('locateInsertedBlock：插入后新块定位（回跳标记用）', () => {
  const block = (start: number, end: number, markdown: string): ServerBlock => ({
    start,
    end,
    kind: 'leafDirective',
    parent: 'root',
    hash: `h${start}`,
    markdown,
  });

  it('按原文切片与插入片段匹配（片段首尾空白归一化）', () => {
    const blocks = [block(0, 5, '前文'), block(7, 26, '::bilibili{bvid=""}')];
    expect(locateInsertedBlock('::bilibili{bvid=""}\n', blocks)).toBe(blocks[1]);
    expect(locateInsertedBlock('\n\n::bilibili{bvid=""}\n\n', blocks)).toBe(blocks[1]);
  });

  it('同内容块重复时取插入点之后的首个', () => {
    const blocks = [block(0, 3, '段落'), block(5, 8, '段落')];
    // after=4（锚块 end 之后）→ 命中最新的那个（start=5）
    expect(locateInsertedBlock('段落', blocks, 4)).toBe(blocks[1]);
    // after=0 → 首个匹配
    expect(locateInsertedBlock('段落', blocks, 0)).toBe(blocks[0]);
  });

  it('无匹配返回 null（服务端列表异常时静默放弃）', () => {
    expect(locateInsertedBlock('不存在的内容', [block(0, 5, '前文')])).toBeNull();
    expect(locateInsertedBlock('x', [])).toBeNull();
  });
});

describe('createInserter：抽屉交互', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  const items = () =>
    Array.from(document.querySelectorAll('.oh-drawer-item')) as HTMLButtonElement[];

  it('打开渲染基础块 + 全部指令条目（8 基础 + DIRECTIVE_DEFS + grid）', () => {
    const ins = createInserter(document, { t, onPick: vi.fn() });
    ins.open(null);
    expect(ins.isOpen()).toBe(true);
    expect(document.querySelector('.oh-drawer')).toBeTruthy();
    expect(document.querySelector('.oh-drawer-mask')).toBeTruthy();
    expect(items()).toHaveLength(8 + DIRECTIVE_DEFS.length + 1);
    // 分节标题
    const headings = Array.from(document.querySelectorAll('.oh-drawer h3')).map((h) => h.textContent);
    expect(headings).toEqual([t('insertSectionBasic'), t('insertSectionDirective')]);
    ins.close();
  });

  it('点击条目：回传对应 markdown 片段与打开时的锚块（顶栏入口锚块为 null），并关闭抽屉', () => {
    const onPick = vi.fn();
    const ins = createInserter(document, { t, onPick });
    ins.open(null);
    items()[0].click(); // 段落
    expect(onPick).toHaveBeenCalledWith(t('blkParagraph'), null);
    expect(ins.isOpen()).toBe(false);

    const anchor = entry(7, 10);
    ins.open(anchor);
    // 最后一条为 grid（不在 DIRECTIVE_DEFS，单独追加）
    const all = items();
    all[all.length - 1].click();
    expect(onPick).toHaveBeenCalledWith(INSERT_SNIPPETS.grid, anchor);
    expect(ins.isOpen()).toBe(false);
  });

  it('Esc 与点击遮罩关闭抽屉', () => {
    const ins = createInserter(document, { t, onPick: vi.fn() });
    ins.open(null);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ins.isOpen()).toBe(false);
    expect(document.querySelector('.oh-drawer')).toBeNull();

    ins.open(null);
    (document.querySelector('.oh-drawer-mask') as HTMLElement).click();
    expect(ins.isOpen()).toBe(false);
  });
});
