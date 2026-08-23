/**
 * 流式播放器的 DOM 光标回归测试。
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
