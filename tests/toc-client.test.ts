/**
 * TOC 与阅读进度条客户端交互测试。
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initToc, _resetTocStateForTesting } from '../src/scripts/toc.ts';

describe('toc & reading-progress client behavior', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    _resetTocStateForTesting();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    _resetTocStateForTesting();
  });

  it('长文章初始化时 progress 为 0，滚动后按比例更新 transform', () => {
    document.body.innerHTML = `
      <div class="reading-progress" style="transform: scaleX(0)"></div>
      <main class="site-main">
        <div class="page-content">
          <h2 id="sec-1">Section 1</h2>
          <p>Long text</p>
        </div>
      </main>
    `;

    const article = document.querySelector<HTMLElement>('.page-content')!;
    const progressBar = document.querySelector<HTMLElement>('.reading-progress')!;

    Object.defineProperty(window, 'innerHeight', { value: 500, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });

    let currentScroll = 0;
    article.getBoundingClientRect = () => ({
      top: 0 - currentScroll,
      bottom: 1500 - currentScroll,
      height: 1500,
      width: 800,
      left: 0,
      right: 800,
      x: 0,
      y: 0 - currentScroll,
      toJSON: () => {},
    });

    initToc();
    expect(progressBar.style.transform).toBe('scaleX(0)');

    // Scroll halfway (scrollDistance = 1500 - 500 = 1000; scrollY = 500 => progress = 0.5)
    currentScroll = 500;
    window.scrollY = 500;
    window.dispatchEvent(new Event('scroll'));

    // Wait a tick for requestAnimationFrame
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        expect(progressBar.style.transform).toBe('scaleX(0.5)');
        resolve();
      });
    });
  });

  it('无 reading-progress 节点时 initToc 与滚动安全无报错', () => {
    document.body.innerHTML = `
      <main class="site-main">
        <div class="page-content">
          <p>Short text</p>
        </div>
      </main>
    `;

    expect(() => {
      initToc();
      window.dispatchEvent(new Event('scroll'));
    }).not.toThrow();
  });

  it('短文章完全在视口内时 progress 为 scaleX(1)', () => {
    document.body.innerHTML = `
      <div class="reading-progress" style="transform: scaleX(0)"></div>
      <main class="site-main">
        <div class="page-content">
          <p>Short text</p>
        </div>
      </main>
    `;

    const article = document.querySelector<HTMLElement>('.page-content')!;
    const progressBar = document.querySelector<HTMLElement>('.reading-progress')!;

    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });

    article.getBoundingClientRect = () => ({
      top: 50,
      bottom: 300,
      height: 250,
      width: 800,
      left: 0,
      right: 800,
      x: 0,
      y: 50,
      toJSON: () => {},
    });

    initToc();
    expect(progressBar.style.transform).toBe('scaleX(1)');
  });

  it('ScrollSpy 根据滚动位置高亮对应目录链接', () => {
    document.body.innerHTML = `
      <aside class="toc">
        <a class="toc-link" href="#heading-1">Heading 1</a>
        <a class="toc-link" href="#heading-2">Heading 2</a>
      </aside>
      <main class="site-main">
        <div class="page-content">
          <h2 id="heading-1">Heading 1</h2>
          <p>Text</p>
          <h2 id="heading-2">Heading 2</h2>
          <p>Text</p>
        </div>
      </main>
    `;

    const h1 = document.querySelector<HTMLElement>('#heading-1')!;
    const h2 = document.querySelector<HTMLElement>('#heading-2')!;
    const link1 = document.querySelector<HTMLAnchorElement>('a[href="#heading-1"]')!;
    const link2 = document.querySelector<HTMLAnchorElement>('a[href="#heading-2"]')!;

    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });

    // threshold = 250
    // Initially h1 is below threshold, h2 is below threshold
    h1.getBoundingClientRect = () => ({ top: 100, bottom: 130, height: 30, width: 500, left: 0, right: 500, x: 0, y: 100, toJSON: () => {} });
    h2.getBoundingClientRect = () => ({ top: 600, bottom: 630, height: 30, width: 500, left: 0, right: 500, x: 0, y: 600, toJSON: () => {} });

    initToc();
    expect(link1.classList.contains('active')).toBe(true);
    expect(link2.classList.contains('active')).toBe(false);

    // Scroll down so h2 is at top <= threshold
    h1.getBoundingClientRect = () => ({ top: -400, bottom: -370, height: 30, width: 500, left: 0, right: 500, x: 0, y: -400, toJSON: () => {} });
    h2.getBoundingClientRect = () => ({ top: 200, bottom: 230, height: 30, width: 500, left: 0, right: 500, x: 0, y: 200, toJSON: () => {} });

    window.dispatchEvent(new Event('scroll'));

    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        expect(link1.classList.contains('active')).toBe(false);
        expect(link2.classList.contains('active')).toBe(true);
        resolve();
      });
    });
  });
});
