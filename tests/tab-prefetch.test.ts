/**
 * 空闲预取管线（src/scripts/tab-prefetch.ts）测试：
 * 阶段一预取常规页面与主图，阶段二在一切常规内容加载完毕后在后台预加载灯箱高清图。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fullBad, resetLightboxBad } from '../src/lib/lightbox.ts';
import {
  _resetPrefetchStateForTesting,
  runPrefetch,
  scheduleTabPrefetch,
} from '../src/scripts/tab-prefetch.ts';

describe('tab-prefetch 管线与灯箱预加载', () => {
  beforeEach(() => {
    resetLightboxBad();
    _resetPrefetchStateForTesting();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('在所有常规页面与主图预取完毕后，加载当前页与已预取页面的灯箱图片', async () => {
    // 模拟当前页面 DOM
    document.body.innerHTML = [
      '<nav class="site-nav"><ul>',
      '<li><a href="/" aria-current="page">首页</a></li>',
      '<li><a href="/gallery/">画廊</a></li>',
      '</ul></nav>',
      '<div class="lang-switcher"><ul class="lang-menu">',
      '<li><a href="/en/" hreflang="en">English</a></li>',
      '</ul></div>',
      '<main class="site-main">',
      '<div class="markdown-body">',
      '<img id="cur-img" src="/assets/hero.webp" data-original="/assets/hero.jpg">',
      '</div>',
      '</main>',
    ].join('');

    // 模拟预取的 /gallery/ 与 /en/ HTML
    const galleryHtml = [
      '<!doctype html><html><body>',
      '<main class="site-main">',
      '<div class="markdown-body">',
      '<img src="/assets/photo.webp" data-original="/assets/photo.jpg">',
      '</div>',
      '</main>',
      '</body></html>',
    ].join('');

    const enHtml = [
      '<!doctype html><html><body>',
      '<main class="site-main">',
      '<div class="markdown-body">',
      '<img src="/assets/en-chart.png">',
      '</div>',
      '</main>',
      '</body></html>',
    ].join('');

    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/gallery/') return { ok: true, text: async () => galleryHtml };
      if (url === '/en/') return { ok: true, text: async () => enHtml };
      return { ok: false, status: 404 };
    });
    vi.stubGlobal('fetch', fetchMock);

    // 记录创建的 Image 实例加载序列
    const loadedImages: string[] = [];
    const createdImages: Array<{ src: string }> = [];

    // Mock Image
    class MockImage {
      decoding = 'async';
      sizes = '';
      srcset = '';
      #src = '';
      #listeners: Record<string, Function[]> = {};

      get src() {
        return this.#src;
      }
      set src(val: string) {
        this.#src = val;
        createdImages.push({ src: val });
        // 模拟异步加载成功
        setTimeout(() => {
          loadedImages.push(val);
          for (const fn of this.#listeners['load'] ?? []) fn();
        }, 5);
      }

      addEventListener(event: string, fn: Function) {
        if (!this.#listeners[event]) this.#listeners[event] = [];
        this.#listeners[event].push(fn);
      }
    }
    vi.stubGlobal('Image', MockImage as unknown as typeof Image);

    await runPrefetch();

    // 阶段一：抓取了两个页面
    expect(fetchMock).toHaveBeenCalledWith('/en/');
    expect(fetchMock).toHaveBeenCalledWith('/gallery/');

    // 阶段二：加载了灯箱候选
    // 当前页 hero-full.jpg, /gallery/ photo-full.jpg, /en/ en-chart-full.png
    expect(loadedImages).toContain('/assets/hero-full.jpg');
    expect(loadedImages).toContain('/assets/photo-full.jpg');
    expect(loadedImages).toContain('/assets/en-chart-full.png');
  });

  it('灯箱高清版 404 时记录到 fullBad 并继续预加载原图回退', async () => {
    document.body.innerHTML = [
      '<nav class="site-nav"><ul><li><a href="/" aria-current="page">首页</a></li></ul></nav>',
      '<main class="site-main">',
      '<div class="markdown-body">',
      '<img src="/assets/art.webp" data-original="/assets/art.jpg">',
      '</div>',
      '</main>',
    ].join('');

    const requested: string[] = [];

    class MockImage {
      decoding = 'async';
      sizes = '';
      srcset = '';
      #src = '';
      #listeners: Record<string, Function[]> = {};

      get src() {
        return this.#src;
      }
      set src(val: string) {
        this.#src = val;
        requested.push(val);
        setTimeout(() => {
          if (val.includes('-full')) {
            // 模拟 -full 404 失败
            for (const fn of this.#listeners['error'] ?? []) fn();
          } else {
            // 原图成功
            for (const fn of this.#listeners['load'] ?? []) fn();
          }
        }, 5);
      }

      addEventListener(event: string, fn: Function) {
        if (!this.#listeners[event]) this.#listeners[event] = [];
        this.#listeners[event].push(fn);
      }
    }
    vi.stubGlobal('Image', MockImage as unknown as typeof Image);

    await runPrefetch();

    // 首次尝试 /assets/art-full.jpg 失败后，自动尝试 /assets/art.jpg
    expect(requested).toEqual(['/assets/art-full.jpg', '/assets/art.jpg']);
    expect(fullBad.has('/assets/art-full.jpg')).toBe(true);
    expect(fullBad.has('/assets/art.jpg')).toBe(false);
  });

  it('Data Saver 或离线时跳过预取', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    scheduleTabPrefetch();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
