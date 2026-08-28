/**
 * 流式播放器的 DOM 光标回归测试 + 编辑模式（oh-edit）完整展开分支（M12g）。
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initStreamBlocks } from '../src/scripts/stream-player.ts';

describe('流式光标位置', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('进入内联元素并在闭合块元素后继续跟随文本', async () => {
    vi.useFakeTimers();
    const tokens = [
      { t: 'open', tag: 'p', h: '<p>' },
      { t: 'open', tag: 'strong', h: '<strong>' },
      { t: 'node', h: '<span>世界</span>' },
      { t: 'close' },
      { t: 'close' },
    ];

    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private readonly callback: IntersectionObserverCallback) {}

        observe(): void {
          this.callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
        }

        disconnect(): void {}
      },
    );
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false }),
    });

    document.body.innerHTML =
      `<div class="stream-block" data-stream-id="test" data-autoplay="true" data-speed="100">` +
      `<div class="stream-content markdown-body"></div>` +
      `<noscript><div class="stream-content markdown-body"><p>你好 <strong>世界</strong>！</p></div></noscript>` +
      `<script type="application/json" class="stream-tokens">${JSON.stringify(tokens)}</script>` +
      `</div>`;

    initStreamBlocks();
    await Promise.resolve();

    const root = document.querySelector<HTMLElement>('.stream-block')!;
    const content = root.querySelector<HTMLElement>(':scope > .stream-content')!;
    const cursor = root.querySelector<HTMLElement>('.stream-cursor')!;

    expect(cursor.parentElement?.tagName).toBe('STRONG');
    expect(cursor.previousElementSibling?.textContent).toBe('世界');

    await vi.runAllTimersAsync();

    expect(cursor.hidden).toBe(true);
    expect(cursor.parentElement).toBe(content);
    expect(cursor.previousElementSibling?.tagName).toBe('P');
  });
});

describe('编辑模式（M12g：<html class="oh-edit">）', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.classList.remove('oh-edit');
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** 搭一个 autoplay 流式块（完整内容在 noscript 内） */
  function mountBlock(): void {
    document.body.innerHTML =
      `<div class="stream-block" data-stream-id="test" data-autoplay="true" data-speed="40">` +
      `<div class="stream-head"><button class="stream-replay" type="button">↻</button></div>` +
      `<div class="stream-content markdown-body"></div>` +
      `<noscript><div class="stream-content markdown-body"><p>完整内容 <strong>全部</strong></p></div></noscript>` +
      `<script type="application/json" class="stream-tokens">[{"t":"open","tag":"p","h":"<p>"},{"t":"text","w":"完"}]</script>` +
      `</div>`;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false }),
    });
  }

  it('不初始化打字机（不挂 IntersectionObserver），直接完整呈现 noscript 内容', () => {
    document.documentElement.classList.add('oh-edit');
    mountBlock();
    const ioSpy = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor() {
          ioSpy();
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    initStreamBlocks();
    const root = document.querySelector<HTMLElement>('.stream-block')!;
    const content = root.querySelector<HTMLElement>(':scope > .stream-content')!;
    expect(ioSpy).not.toHaveBeenCalled(); // 未进入 autoplay 观察分支
    // 注意：jsdom（scripting 关闭）把 noscript 解析为 DOM，textContent 只剩纯文本；
    // 浏览器（JS 开启）textContent 是原始 HTML 字符串——两种口径都包含完整内容文本
    expect(content.textContent).toContain('完整内容');
    expect(content.textContent).toContain('全部');
    expect(root.classList.contains('stream-done')).toBe(true);
    expect(root.classList.contains('stream-playing')).toBe(false);
  });

  it('重播按钮在编辑模式同样只完整呈现（脚本兜底；按钮另有 overlay.css 隐藏）', () => {
    document.documentElement.classList.add('oh-edit');
    mountBlock();
    initStreamBlocks();
    const root = document.querySelector<HTMLElement>('.stream-block')!;
    root.querySelector<HTMLButtonElement>('.stream-replay')!.click();
    const content = root.querySelector<HTMLElement>(':scope > .stream-content')!;
    expect(content.textContent).toContain('完整内容');
    expect(root.classList.contains('stream-playing')).toBe(false);
  });

  it('无 oh-edit 时行为不变：autoplay 块仍走 IntersectionObserver 播放', () => {
    mountBlock();
    const ioSpy = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor() {
          ioSpy();
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    initStreamBlocks();
    expect(ioSpy).toHaveBeenCalledTimes(1); // 生产路径不受影响
    const content = document.querySelector<HTMLElement>('.stream-block > .stream-content')!;
    expect(content.innerHTML).toBe(''); // 尚未进入可视区，内容为空
  });
});
