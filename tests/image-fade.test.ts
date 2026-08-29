/**
 * 视口下方懒加载图片淡入：只标记非首屏、未完成加载的图片。
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initImageFade } from '../src/scripts/image-fade.ts';

describe('lazy image fade', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <img id="above" loading="lazy">
      <img id="below" loading="lazy">
      <img id="loaded" loading="lazy">
    `;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    const tops: Record<string, number> = { above: 100, below: 900, loaded: 900 };
    for (const id of Object.keys(tops)) {
      Object.defineProperty(document.getElementById(id)!, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ top: tops[id] }),
      });
    }
    for (const id of ['above', 'below']) {
      Object.defineProperty(document.getElementById(id)!, 'complete', {
        configurable: true,
        value: false,
      });
    }
    Object.defineProperty(document.getElementById('loaded')!, 'complete', {
      configurable: true,
      value: true,
    });
  });

  it('只给视口下方未加载图片挂 pending，load 后切到 loaded', () => {
    initImageFade();
    const above = document.querySelector<HTMLImageElement>('#above')!;
    const below = document.querySelector<HTMLImageElement>('#below')!;
    const loaded = document.querySelector<HTMLImageElement>('#loaded')!;

    expect(above.dataset.imageFade).toBeUndefined();
    expect(loaded.dataset.imageFade).toBeUndefined();
    expect(below.dataset.imageFade).toBe('pending');

    below.dispatchEvent(new Event('load'));
    expect(below.dataset.imageFade).toBe('loaded');
  });

  it('reduced-motion 下不做隐藏标记', () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    initImageFade();
    expect(document.querySelector<HTMLImageElement>('#below')!.dataset.imageFade).toBeUndefined();
  });
});
