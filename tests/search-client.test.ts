/**
 * 前台全局搜索客户端（initSearch）DOM 交互行为：
 * 搜索范围单按钮在 current/all 间切换并刷新文案与 aria 状态、切换后按作用域重新过滤；
 * 模态框打开/关闭动画、快捷键、防抖搜索、键盘导航与本地 DOM 索引回退。
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SearchResultItem } from '../src/lib/search.ts';

function mountSearchDom(): void {
  document.body.innerHTML = `
    <button class="search-toggle" type="button"></button>
    <dialog class="search-dialog" hidden>
      <div class="search-form">
        <input class="search-input" type="text" />
        <button class="search-scope-toggle" type="button"></button>
        <button class="search-clear-btn" type="button" hidden></button>
        <button class="search-close" type="button"></button>
      </div>
      <ul class="search-results"></ul>
      <div class="search-status"></div>
      <span class="search-hint-nav"></span>
      <span class="search-hint-select"></span>
      <span class="search-hint-close"></span>
    </dialog>
  `;
}

function queryEls() {
  return {
    dialog: document.querySelector<HTMLDialogElement>('.search-dialog')!,
    toggleBtn: document.querySelector<HTMLButtonElement>('.search-toggle')!,
    input: document.querySelector<HTMLInputElement>('.search-input')!,
    clearBtn: document.querySelector<HTMLButtonElement>('.search-clear-btn')!,
    closeBtn: document.querySelector<HTMLButtonElement>('.search-close')!,
    resultsList: document.querySelector<HTMLUListElement>('.search-results')!,
    statusEl: document.querySelector<HTMLElement>('.search-status')!,
    scopeToggle: document.querySelector<HTMLButtonElement>('.search-scope-toggle')!,
  };
}

/** 冲刷微任务队列，等待 performSearch 内部的 fetch/promise 链解析完毕 */
async function flushAsync(rounds = 20): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

function stubFetchIndex(items: SearchResultItem[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => items,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const zhItem: SearchResultItem = {
  id: '/zh/a',
  url: '/zh/a',
  title: 'Test 中文文章',
  excerpt: 'zh excerpt test',
  lang: 'zh',
};
const enItem: SearchResultItem = {
  id: '/en/a',
  url: '/en/a',
  title: 'Test English Post',
  excerpt: 'en excerpt',
  lang: 'en',
};

describe('全局搜索客户端 initSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // requestAnimationFrame 同步执行，避免依赖定时器步进
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    vi.resetModules();
    mountSearchDom();
    document.documentElement.dataset.routeLang = 'zh';
    delete document.documentElement.dataset.base;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    delete document.documentElement.dataset.routeLang;
    delete document.documentElement.dataset.base;
  });

  async function init() {
    const { initSearch } = await import('../src/scripts/search.ts');
    initSearch();
  }

  it('初始化时范围按钮显示当前语言文案并同步 aria 状态', async () => {
    stubFetchIndex([]);
    await init();
    const { scopeToggle, statusEl } = queryEls();

    expect(scopeToggle.textContent).toBe('当前语言');
    expect(scopeToggle.dataset.scope).toBe('current');
    expect(scopeToggle.getAttribute('aria-pressed')).toBe('false');
    expect(scopeToggle.getAttribute('title')).toBe('搜索范围');
    expect(scopeToggle.getAttribute('aria-label')).toBe('搜索范围');
    expect(statusEl.textContent).toBe('输入关键词开始搜索...');
  });

  it('点击范围按钮在 current/all 间切换并刷新文案与 aria-pressed', async () => {
    stubFetchIndex([]);
    await init();
    const { scopeToggle } = queryEls();

    scopeToggle.click();
    await flushAsync();
    expect(scopeToggle.textContent).toBe('全部语言');
    expect(scopeToggle.dataset.scope).toBe('all');
    expect(scopeToggle.getAttribute('aria-pressed')).toBe('true');

    scopeToggle.click();
    await flushAsync();
    expect(scopeToggle.textContent).toBe('当前语言');
    expect(scopeToggle.dataset.scope).toBe('current');
    expect(scopeToggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('切换范围会重新触发搜索并按作用域过滤结果', async () => {
    document.documentElement.dataset.base = '/base';
    const fetchMock = stubFetchIndex([zhItem, enItem]);
    await init();
    const { input, scopeToggle, resultsList, statusEl } = queryEls();

    input.value = 'test';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);
    await flushAsync();

    // 默认 current 作用域：仅命中当前语言条目
    expect(fetchMock).toHaveBeenCalledWith('/base/search-index.json');
    expect(resultsList.querySelectorAll('.search-item')).toHaveLength(1);
    expect(statusEl.textContent).toBe('找到 1 条结果');
    expect(resultsList.querySelector<HTMLAnchorElement>('.search-result-link')?.getAttribute('href')).toBe('/base/zh/a');

    scopeToggle.click();
    await flushAsync();

    // all 作用域：两种语言条目都命中
    expect(resultsList.querySelectorAll('.search-item')).toHaveLength(2);
    expect(statusEl.textContent).toBe('找到 2 条结果');
    expect(scopeToggle.dataset.scope).toBe('all');

    scopeToggle.click();
    await flushAsync();
    expect(resultsList.querySelectorAll('.search-item')).toHaveLength(1);
  });

  it('英文环境下范围按钮使用英文文案', async () => {
    document.documentElement.dataset.routeLang = 'en';
    stubFetchIndex([]);
    await init();
    const { scopeToggle } = queryEls();

    expect(scopeToggle.textContent).toBe('This language');
    expect(scopeToggle.getAttribute('aria-label')).toBe('Search scope');

    scopeToggle.click();
    await flushAsync();
    expect(scopeToggle.textContent).toBe('All languages');
    expect(scopeToggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('点击搜索按钮打开模态框并聚焦输入框', async () => {
    stubFetchIndex([]);
    await init();
    const { dialog, toggleBtn, input } = queryEls();

    toggleBtn.click();
    expect(dialog.hidden).toBe(false);
    expect(dialog.classList.contains('open')).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it('关闭按钮经动画后隐藏模态框并还焦给开关按钮', async () => {
    stubFetchIndex([]);
    await init();
    const { dialog, toggleBtn, closeBtn } = queryEls();

    toggleBtn.click();
    closeBtn.click();
    expect(dialog.classList.contains('closing')).toBe(true);
    expect(dialog.hidden).toBe(false);

    vi.advanceTimersByTime(220);
    expect(dialog.hidden).toBe(true);
    expect(dialog.classList.contains('closing')).toBe(false);
    expect(document.activeElement).toBe(toggleBtn);
  });

  it('Ctrl+K 快捷键打开模态框，再次按下关闭', async () => {
    stubFetchIndex([]);
    await init();
    const { dialog } = queryEls();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    expect(dialog.hidden).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    vi.advanceTimersByTime(220);
    expect(dialog.hidden).toBe(true);
  });

  it('斜杠快捷键在输入控件外打开，输入框内不触发', async () => {
    stubFetchIndex([]);
    await init();
    const { dialog, input } = queryEls();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    expect(dialog.hidden).toBe(true);

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    expect(dialog.hidden).toBe(false);
  });

  it('Escape 与点击遮罩均可关闭模态框', async () => {
    stubFetchIndex([]);
    await init();
    const { dialog, toggleBtn } = queryEls();

    toggleBtn.click();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    vi.advanceTimersByTime(220);
    expect(dialog.hidden).toBe(true);

    toggleBtn.click();
    dialog.click();
    vi.advanceTimersByTime(220);
    expect(dialog.hidden).toBe(true);
  });

  it('输入防抖后触发搜索，清空按钮复位输入与状态', async () => {
    stubFetchIndex([zhItem]);
    await init();
    const { input, clearBtn, resultsList, statusEl } = queryEls();

    input.value = 'test';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(clearBtn.hidden).toBe(false);

    // 防抖期间尚未触发搜索
    expect(resultsList.querySelectorAll('.search-item')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(100);
    await flushAsync();
    expect(resultsList.querySelectorAll('.search-item')).toHaveLength(1);

    clearBtn.click();
    await flushAsync();
    expect(input.value).toBe('');
    expect(clearBtn.hidden).toBe(true);
    expect(resultsList.querySelectorAll('.search-item')).toHaveLength(0);
    expect(statusEl.textContent).toBe('输入关键词开始搜索...');
  });

  it('上下方向键在结果间循环切换高亮', async () => {
    const items: SearchResultItem[] = [
      { id: '/zh/1', url: '/zh/1', title: 'test 一', excerpt: '', lang: 'zh' },
      { id: '/zh/2', url: '/zh/2', title: 'test 二', excerpt: '', lang: 'zh' },
      { id: '/zh/3', url: '/zh/3', title: 'test 三', excerpt: '', lang: 'zh' },
    ];
    stubFetchIndex(items);
    await init();
    const { input, resultsList } = queryEls();

    input.value = 'test';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);
    await flushAsync();

    const activeIdx = () =>
      [...resultsList.querySelectorAll('.search-item')].findIndex((el) => el.classList.contains('active'));

    expect(activeIdx()).toBe(0);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(activeIdx()).toBe(1);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(activeIdx()).toBe(0);
    // 从首条继续向上回绕到末条
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(activeIdx()).toBe(2);
  });

  it('静态索引不可用时回退到本地 DOM 索引', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => [] })));
    await init();
    const { input, resultsList } = queryEls();

    document.body.insertAdjacentHTML(
      'beforeend',
      `<h1>本地标题</h1>
       <div class="markdown-body">
         <h2 id="sec">本地章节</h2>
         <p>章节摘要内容</p>
       </div>`
    );

    input.value = '本地章节';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);
    await flushAsync();

    const titles = [...resultsList.querySelectorAll('.search-result-title')].map((el) => el.textContent);
    expect(titles).toContain('本地章节 · 本地标题');
    expect(resultsList.querySelector('.search-result-excerpt')?.textContent).toContain('章节摘要内容');
  });
});
