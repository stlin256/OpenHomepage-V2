/**
 * overlay 骨架（admin/ui/overlay，M12a）jsdom 测试：
 * scanner 块注册表（data-oh-src 解析/非法值跳过/嵌套与 oh-embed 包裹块）；
 * main 顶栏（i18n 文案 + 退出编辑清标记）与 hover 描边高亮。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { parseOhSrc, scanBlocks } from '../admin/ui/overlay/scanner.ts';
import { initOverlay } from '../admin/ui/overlay/main.ts';
import { createT } from '../admin/shared/i18n.ts';

const t = createT('zh');

describe('scanner：块注册表', () => {
  it('parseOhSrc 解析合法坐标，拒绝非法格式', () => {
    expect(parseOhSrc('pages/zh/index.md:10,20')).toEqual({
      source: 'pages/zh/index.md',
      start: 10,
      end: 20,
    });
    expect(parseOhSrc('pages/en/a.b.md:0,3')).toEqual({ source: 'pages/en/a.b.md', start: 0, end: 3 });
    expect(parseOhSrc('')).toBeNull();
    expect(parseOhSrc('pages/zh/index.md')).toBeNull();
    expect(parseOhSrc('pages/zh/index.md:10')).toBeNull();
    expect(parseOhSrc('pages/zh/index.md:a,b')).toBeNull();
  });

  it('scanBlocks 建立 元素↔坐标 注册表（文档序，嵌套与 oh-embed 包裹都收录，非法值跳过）', () => {
    document.body.innerHTML = [
      '<div class="markdown-body">',
      '<p data-oh-src="pages/zh/index.md:0,5">甲</p>',
      '<div data-oh-src="pages/zh/index.md:7,60" class="md-grid">',
      '<div data-oh-src="pages/zh/index.md:18,30" class="md-grid-cell"><p data-oh-src="pages/zh/index.md:25,27">左</p></div>',
      '</div>',
      '<div data-oh-src="pages/zh/index.md:62,90" class="oh-embed"><div class="stream-block">F</div></div>',
      '<p>无坐标</p>',
      '<p data-oh-src="非法值">坏坐标</p>',
      '</div>',
    ].join('');
    const entries = scanBlocks(document.body);
    expect(entries.map((e) => `${e.span.start}:${e.span.end}`)).toEqual(['0:5', '7:60', '18:30', '25:27', '62:90']);
    expect(entries[2].el.classList.contains('md-grid-cell')).toBe(true);
    expect(entries[4].el.classList.contains('oh-embed')).toBe(true);
    expect(entries.every((e) => e.span.source === 'pages/zh/index.md')).toBe(true);
  });
});

describe('main：顶栏与 hover 描边', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.classList.remove('oh-editing');
    sessionStorage.clear();
    // 固定中文界面（jsdom 的 navigator.language 为 en-US，会走英文文案）
    localStorage.setItem('oh-admin-lang', 'zh');
  });

  it('initOverlay 注入顶栏（编辑模式标识 + 退出按钮，文案走 i18n）并返回块注册表', () => {
    document.body.innerHTML = '<p data-oh-src="pages/zh/index.md:0,5">甲</p>';
    const { blocks } = initOverlay(document);
    const bar = document.querySelector('.oh-topbar')!;
    expect(bar).toBeTruthy();
    expect(bar.querySelector('.oh-badge')!.textContent).toBe(t('editModeBadge'));
    expect(bar.querySelector('.oh-exit')!.textContent).toBe(t('exitEdit'));
    expect(document.documentElement.classList.contains('oh-editing')).toBe(true);
    expect(blocks).toHaveLength(1);
  });

  it('hover 时最近的 [data-oh-src] 祖先加描边 class，移走即清', () => {
    document.body.innerHTML = [
      '<div data-oh-src="pages/zh/index.md:0,10" class="md-grid">',
      '<p data-oh-src="pages/zh/index.md:3,5"><span id="inner">字</span></p>',
      '</div>',
      '<p id="outside">无坐标</p>',
    ].join('');
    initOverlay(document);
    const cellP = document.querySelector('[data-oh-src="pages/zh/index.md:3,5"]')!;
    // 事件落在内层 span 上 → 最近祖先是段落而非 grid
    document.querySelector('#inner')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(cellP.classList.contains('oh-hover')).toBe(true);
    expect(cellP.parentElement!.classList.contains('oh-hover')).toBe(false);
    // 移到无坐标元素 → 清除
    document.querySelector('#outside')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(cellP.classList.contains('oh-hover')).toBe(false);
  });

  it('退出编辑：清 sessionStorage 标记', () => {
    sessionStorage.setItem('oh-edit', '1');
    document.body.innerHTML = '<p data-oh-src="pages/zh/index.md:0,5">甲</p>';
    initOverlay(document);
    (document.querySelector('.oh-exit') as HTMLButtonElement).click();
    expect(sessionStorage.getItem('oh-edit')).toBeNull();
  });
});
