/**
 * 滚动显现基线回归：首屏不等待 JS，视口外才进入动画初始态。
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initMotion } from '../src/scripts/motion.ts';

describe('initMotion reveal', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('marks below-viewport blocks pending while first-screen blocks stay visible', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    document.body.innerHTML =
      '<section class="reveal" id="first"></section><section class="reveal" id="below"></section>';
    const top = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: Element) {
        return {
          top: this.id === 'below' ? window.innerHeight + 100 : 0,
          bottom: 0,
          left: 0,
          right: 0,
          width: 0,
          height: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });

    initMotion();

    expect(document.querySelector('#first')!.classList.contains('reveal-pending')).toBe(false);
    expect(document.querySelector('#below')!.classList.contains('reveal-pending')).toBe(true);
    expect(top).toHaveBeenCalled();
  });
});
