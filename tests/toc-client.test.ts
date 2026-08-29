/**
 * TOC 与阅读进度条客户端交互测试。
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initToc, _resetTocStateForTesting, animateCollapsible } from '../src/scripts/toc.ts';

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

describe('mobile collapsible toc animation', () => {
  let createdAnimations: { onfinish?: () => void; oncancel?: () => void; cancel: ReturnType<typeof vi.fn> }[] = [];

  beforeEach(() => {
    document.body.innerHTML = '';
    _resetTocStateForTesting();
    createdAnimations = [];
    vi.restoreAllMocks();

    HTMLElement.prototype.animate = vi.fn(function (this: HTMLElement) {
      const anim = {
        cancel: vi.fn(),
        onfinish: undefined as (() => void) | undefined,
        oncancel: undefined as (() => void) | undefined,
      };
      createdAnimations.push(anim);
      return anim as unknown as Animation;
    });
  });

  afterEach(() => {
    _resetTocStateForTesting();
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
  });

  function setupCollapsible(open = false) {
    document.body.innerHTML = `
      <details class="toc-collapsible"${open ? ' open' : ''}>
        <summary class="toc-collapsible-summary">
          <span>文章目录</span>
          <svg class="toc-chevron"></svg>
        </summary>
        <div class="toc-collapsible-body">
          <nav class="toc">
            <ol class="toc-list">
              <li class="toc-item"><a href="#sec-1" class="toc-link">Section 1</a></li>
              <li class="toc-item"><a href="#sec-2" class="toc-link">Section 2</a></li>
            </ol>
          </nav>
        </div>
      </details>
    `;

    const details = document.querySelector<HTMLDetailsElement>('.toc-collapsible')!;
    const summary = details.querySelector<HTMLElement>('summary')!;
    const body = details.querySelector<HTMLElement>('.toc-collapsible-body')!;

    Object.defineProperty(body, 'scrollHeight', { value: 180, configurable: true });
    body.getBoundingClientRect = () => ({
      top: 0,
      bottom: open ? 180 : 0,
      height: open ? 180 : 0,
      width: 300,
      left: 0,
      right: 300,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    return { details, summary, body };
  }

  it('点击关闭状态的 summary 会触发平滑展开动画并在结束时清理状态', () => {
    const { details, summary, body } = setupCollapsible(false);
    initToc();

    expect(details.open).toBe(false);
    summary.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    // open 立即设为 true，添加 is-opening 类
    expect(details.open).toBe(true);
    expect(details.classList.contains('is-opening')).toBe(true);
    expect(body.animate).toHaveBeenCalledTimes(1);

    const keyframes = vi.mocked(body.animate).mock.calls[0][0] as Keyframe[];
    expect(keyframes).toEqual([
      { height: '0px', opacity: 0, transform: 'translateY(-4px)' },
      { height: '180px', opacity: 1, transform: 'translateY(0)' },
    ]);

    // 动画完成
    createdAnimations[0].onfinish?.();
    expect(details.classList.contains('is-opening')).toBe(false);
  });

  it('点击展开状态的 summary 会触发平滑关闭动画并在结束时设置 open 为 false', () => {
    const { details, summary, body } = setupCollapsible(true);
    initToc();

    expect(details.open).toBe(true);
    summary.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    // 仍保持 open 直到动画结束，添加 is-closing 类
    expect(details.open).toBe(true);
    expect(details.classList.contains('is-closing')).toBe(true);
    expect(body.animate).toHaveBeenCalledTimes(1);

    const keyframes = vi.mocked(body.animate).mock.calls[0][0] as Keyframe[];
    expect(keyframes).toEqual([
      { height: '180px', opacity: 1, transform: 'translateY(0)' },
      { height: '0px', opacity: 0, transform: 'translateY(-4px)' },
    ]);

    // 动画完成
    createdAnimations[0].onfinish?.();
    expect(details.open).toBe(false);
    expect(details.classList.contains('is-closing')).toBe(false);
  });

  it('连续快速点击 summary 时会取消正在运行的动画并平滑反转', () => {
    const { details, summary, body } = setupCollapsible(false);
    initToc();

    // 1. 展开
    summary.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(details.classList.contains('is-opening')).toBe(true);
    expect(body.animate).toHaveBeenCalledTimes(1);
    const firstAnim = createdAnimations[0];

    // 2. 动画尚未完成时再次点击（请求关闭）
    summary.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(firstAnim.cancel).toHaveBeenCalled();
    expect(details.classList.contains('is-closing')).toBe(true);
    expect(body.animate).toHaveBeenCalledTimes(2);

    // 3. 再次点击（反转回展开）
    summary.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const secondAnim = createdAnimations[1];
    expect(secondAnim.cancel).toHaveBeenCalled();
    expect(details.classList.contains('is-opening')).toBe(true);
    expect(body.animate).toHaveBeenCalledTimes(3);
  });

  it('移动端视口下点击内部 toc-link 会平滑收起目录', () => {
    const { details, body } = setupCollapsible(true);
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
    initToc();

    const link = details.querySelector<HTMLAnchorElement>('.toc-link')!;
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(details.classList.contains('is-closing')).toBe(true);
    expect(body.animate).toHaveBeenCalledTimes(1);

    createdAnimations[0].onfinish?.();
    expect(details.open).toBe(false);
  });

  it('桌面端视口（>=1200px）下点击 link 不触发折叠动画逻辑', () => {
    const { details, body } = setupCollapsible(true);
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
    initToc();

    const link = details.querySelector<HTMLAnchorElement>('.toc-link')!;
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(body.animate).not.toHaveBeenCalled();
    expect(details.open).toBe(true);
  });

  it('prefers-reduced-motion 下直接切换状态，不调用 animate', () => {
    const { details, summary, body } = setupCollapsible(false);
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    initToc();
    animateCollapsible(details, body, true);
    expect(details.open).toBe(true);
    expect(body.animate).not.toHaveBeenCalled();

    animateCollapsible(details, body, false);
    expect(details.open).toBe(false);
    expect(body.animate).not.toHaveBeenCalled();
  });

  it('无 Web Animations API 环境下直接优雅降级切换 open 状态', () => {
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
    const { details, summary, body } = setupCollapsible(false);
    initToc();

    animateCollapsible(details, body, true);
    expect(details.open).toBe(true);

    animateCollapsible(details, body, false);
    expect(details.open).toBe(false);
  });
});
