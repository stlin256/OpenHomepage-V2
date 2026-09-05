/**
 * 滚动显现基线回归：首屏不等待 JS，视口外才进入动画初始态；
 * 并覆盖 IntersectionObserver 回调、杂志视差（rAF 节流更新）、
 * reduced-motion / 粗指针下关闭视差等分支。
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initMotion } from '../src/scripts/motion.ts';

/** matchMedia stub：predicate 命中的查询返回 matches=true */
function stubMatchMedia(matches: (query: string) => boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({ matches: matches(query) })),
  });
}

/** IntersectionObserver stub：记录回调与 observe/unobserve 目标 */
interface IoStub {
  callback: IntersectionObserverCallback;
  observed: Element[];
  unobserved: Element[];
}

function stubIntersectionObserver(): IoStub {
  const stub: IoStub = { callback: () => {}, observed: [], unobserved: [] };
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IntersectionObserverCallback) {
        stub.callback = cb;
      }
      observe(el: Element): void {
        stub.observed.push(el);
      }
      unobserve(el: Element): void {
        stub.unobserved.push(el);
      }
      disconnect(): void {}
    },
  );
  return stub;
}

/** 按元素 id 指定 getBoundingClientRect 的 top/height（其余字段取 0） */
function mockRects(map: Record<string, { top: number; height: number }>): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const r = map[this.id] ?? { top: 0, height: 0 };
    return {
      top: r.top,
      height: r.height,
      bottom: r.top + r.height,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  });
}

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

describe('initMotion IntersectionObserver 回调', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('进入视口的项标记 revealed 并取消观察，未进入的项跳过', () => {
    stubMatchMedia(() => false);
    const io = stubIntersectionObserver();
    document.body.innerHTML =
      '<section class="reveal reveal-pending" id="in"></section>' +
      '<section class="reveal" id="out"></section>' +
      '<section class="reveal revealed" id="done"></section>';

    initMotion();

    const inEl = document.querySelector('#in')!;
    const outEl = document.querySelector('#out')!;
    // 已 revealed 的项不再进入观察列表
    expect(io.observed).toContain(inEl);
    expect(io.observed).toContain(outEl);
    expect(io.observed).not.toContain(document.querySelector('#done'));

    io.callback(
      [
        { isIntersecting: true, target: inEl },
        { isIntersecting: false, target: outEl },
      ] as unknown as IntersectionObserverEntry[],
      {} as unknown as IntersectionObserver,
    );

    expect(inEl.classList.contains('reveal-pending')).toBe(false);
    expect(inEl.classList.contains('revealed')).toBe(true);
    expect(io.unobserved).toContain(inEl);
    expect(outEl.classList.contains('revealed')).toBe(false);
    expect(io.unobserved).not.toContain(outEl);
  });
});

describe('initMotion 视差', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('初始化即按元素相对视口中心位置应用位移', async () => {
    stubMatchMedia(() => false);
    stubIntersectionObserver();
    document.body.innerHTML = '<div data-parallax id="p"></div>';
    // progress = (top + height/2 - vh/2) / (vh/2) = 0.5 → 位移 40*0.5 = 20px
    mockRects({ p: { top: window.innerHeight * 0.75, height: 0 } });

    // 视差滚动监听为模块级一次性绑定，需重置模块以覆盖绑定分支
    vi.resetModules();
    const { initMotion: freshInitMotion } = await import('../src/scripts/motion.ts');
    freshInitMotion();

    expect(document.querySelector<HTMLElement>('#p')!.style.transform).toBe('translateY(20px)');
  });

  it('滚动经 rAF 节流更新位移，帧回调前的重复滚动不重复排帧', async () => {
    stubMatchMedia(() => false);
    stubIntersectionObserver();
    document.body.innerHTML = '<div data-parallax id="p"></div>';
    const vh = window.innerHeight;
    let top = vh; // progress = 1 → 位移 +40px
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          top,
          height: 0,
          bottom: top,
          left: 0,
          right: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    );
    const rafQueue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });

    vi.resetModules();
    const { initMotion: freshInitMotion } = await import('../src/scripts/motion.ts');
    freshInitMotion();
    const el = document.querySelector<HTMLElement>('#p')!;
    expect(el.style.transform).toBe('translateY(40px)');

    window.dispatchEvent(new Event('scroll'));
    const queued = rafQueue.length;
    expect(queued).toBeGreaterThan(0);
    // 帧回调未执行前的再次滚动被节流，队列不再增长
    window.dispatchEvent(new Event('scroll'));
    expect(rafQueue).toHaveLength(queued);

    top = 0; // progress = -1 → 位移 -40px
    for (const cb of rafQueue.splice(0)) cb(0);
    expect(el.style.transform).toBe('translateY(-40px)');
  });

  it('prefers-reduced-motion 时关闭视差，仅保留滚动显现', async () => {
    stubMatchMedia((query) => query.includes('reduce'));
    const io = stubIntersectionObserver();
    document.body.innerHTML =
      '<div data-parallax id="p"></div><section class="reveal" id="r"></section>';
    mockRects({ p: { top: window.innerHeight, height: 0 } });

    vi.resetModules();
    const { initMotion: freshInitMotion } = await import('../src/scripts/motion.ts');
    freshInitMotion();

    expect(document.querySelector<HTMLElement>('#p')!.style.transform).toBe('');
    expect(io.observed).toContain(document.querySelector('#r'));
  });

  it('重复初始化不重复绑定滚动监听', async () => {
    stubMatchMedia(() => false);
    stubIntersectionObserver();
    document.body.innerHTML = '<div data-parallax id="p"></div>';
    // progress = 1 → 位移 +40px
    mockRects({ p: { top: window.innerHeight, height: 0 } });

    vi.resetModules();
    const { initMotion: freshInitMotion } = await import('../src/scripts/motion.ts');
    freshInitMotion();
    freshInitMotion(); // 第二次调用命中 parallaxBound 已绑定的跳过分支

    expect(document.querySelector<HTMLElement>('#p')!.style.transform).toBe('translateY(40px)');
  });

  it('粗指针（触屏）设备同样关闭视差', async () => {
    stubMatchMedia((query) => query.includes('coarse'));
    stubIntersectionObserver();
    document.body.innerHTML = '<div data-parallax id="p"></div>';
    mockRects({ p: { top: window.innerHeight, height: 0 } });

    vi.resetModules();
    const { initMotion: freshInitMotion } = await import('../src/scripts/motion.ts');
    freshInitMotion();

    expect(document.querySelector<HTMLElement>('#p')!.style.transform).toBe('');
  });
});
