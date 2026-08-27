/**
 * overlay 骨架（admin/ui/overlay，M12a）jsdom 测试：
 * scanner 块注册表（data-oh-src 解析/非法值跳过/嵌套与 oh-embed 包裹块）；
 * main 顶栏（i18n 文案 + 退出编辑清标记）与 hover 描边高亮。
 * M12b：mergeServerBlocks 服务端块数据合并、initOverlay 启动时按 fileRef 拉取合并。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseOhSrc,
  scanBlocks,
  mergeServerBlocks,
  type ServerBlock,
} from '../admin/ui/overlay/scanner.ts';
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

describe('mergeServerBlocks：DOM ↔ 服务端块对齐（M12b）', () => {
  const SERVER: ServerBlock[] = [
    { start: 0, end: 5, kind: 'paragraph', parent: 'root', hash: 'h1', markdown: '甲' },
    { start: 7, end: 60, kind: 'containerDirective', name: 'grid', parent: 'root', hash: 'h2', markdown: '::::grid\n::::' },
    // html 原文块 raw 直出无元素可挂坐标（markdown.ts），服务端有、DOM 无
    { start: 62, end: 90, kind: 'html', parent: 'root', hash: 'h3', markdown: '<div>x</div>' },
  ];

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('按 (start,end) 合并 hash/kind/name/parent/markdown；对不上的双方各 console.warn 跳过', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    document.body.innerHTML = [
      '<p data-oh-src="pages/zh/index.md:0,5">甲</p>',
      '<div data-oh-src="pages/zh/index.md:7,60" class="md-grid"></div>',
      '<p data-oh-src="pages/zh/index.md:100,105">陈旧坐标</p>',
    ].join('');
    const entries = scanBlocks(document.body);
    mergeServerBlocks(entries, 'pages/zh/index.md', SERVER);
    expect(entries[0].hash).toBe('h1');
    expect(entries[0].kind).toBe('paragraph');
    expect(entries[0].parent).toBe('root');
    expect(entries[0].markdown).toBe('甲');
    expect(entries[1].kind).toBe('containerDirective');
    expect(entries[1].name).toBe('grid');
    // 陈旧坐标 DOM 块未合并（保持 undefined，操作禁用）
    expect(entries[2].hash).toBeUndefined();
    // 服务端 html 块无 DOM 对应 + 陈旧 DOM 块各 warn 一次
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('只合并指定 source 的注册表项', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    document.body.innerHTML = '<p data-oh-src="pages/en/index.md:0,5">A</p>';
    const entries = scanBlocks(document.body);
    mergeServerBlocks(entries, 'pages/zh/index.md', SERVER);
    expect(entries[0].hash).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(3); // 服务端块全部未匹配
    warn.mockRestore();
  });
});

describe('main：块数据加载（M12b）', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.classList.remove('oh-editing');
    sessionStorage.clear();
    localStorage.setItem('oh-admin-lang', 'zh');
    delete (window as Record<string, unknown>).__OH_ADMIN_ORIGIN__;
    delete (window as Record<string, unknown>).__OH_PAGE_SOURCE__;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('启动时按 fileRef 拉取服务端块数据并合并进注册表；顶栏带状态区与＋插入按钮', async () => {
    (window as Record<string, unknown>).__OH_ADMIN_ORIGIN__ = 'http://127.0.0.1:4174/';
    (window as Record<string, unknown>).__OH_PAGE_SOURCE__ = 'pages/zh/index.md';
    const serverBlocks: ServerBlock[] = [
      { start: 0, end: 5, kind: 'paragraph', parent: 'root', hash: 'h1', markdown: '甲' },
    ];
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('http://127.0.0.1:4174/api/page/blocks?path=pages%2Fzh%2Findex.md');
      return { ok: true, json: async () => ({ blocks: serverBlocks }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    document.body.innerHTML = '<p data-oh-src="pages/zh/index.md:0,5">甲</p>';
    const { blocks, ready } = initOverlay(document);
    expect(blocks[0].hash).toBeUndefined(); // 合并前仅坐标
    await ready;
    expect(blocks[0].hash).toBe('h1');
    expect(blocks[0].kind).toBe('paragraph');
    expect(blocks[0].markdown).toBe('甲');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const bar = document.querySelector('.oh-topbar')!;
    expect(bar.querySelector('.oh-status')!.getAttribute('aria-live')).toBe('polite');
    expect(bar.querySelector('.oh-insert')!.textContent).toContain(t('insertBlock'));
  });

  it('块数据拉取失败：顶栏显示错误，注册表保持仅坐标（不中断 overlay）', async () => {
    (window as Record<string, unknown>).__OH_ADMIN_ORIGIN__ = 'http://127.0.0.1:4174';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) }))
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    document.body.innerHTML = '<p data-oh-src="pages/zh/index.md:0,5">甲</p>';
    const { blocks, ready } = initOverlay(document);
    await ready;
    expect(blocks[0].hash).toBeUndefined();
    expect(document.querySelector('.oh-status')!.textContent).toContain(t('blockDataFailed'));
    expect(warn).toHaveBeenCalled();
  });
});
