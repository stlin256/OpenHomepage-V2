/**
 * 贡献热力图 tooltip：显示/隐藏状态类与延迟隐藏行为、移动端点按开关、
 * Esc/容器滚动/ClientRouter 转场前的关闭与重建。
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initHeatmapTooltips } from '../src/scripts/heatmap.ts';

describe('heatmap tooltip animation state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div class="heatmap-scroll"><div class="heat-cell" data-tip="3 contributions"></div></div>';
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    const cell = document.querySelector('.heat-cell')!;
    Object.defineProperty(cell, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 100, right: 110, top: 100, bottom: 110, width: 10, height: 10 }),
    });
    Object.defineProperty(document.querySelector('.heatmap-scroll')!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, right: 500, top: 0, bottom: 300, width: 500, height: 300 }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('hover 显示时挂可见类，移出后延迟隐藏', () => {
    initHeatmapTooltips();
    const cell = document.querySelector('.heat-cell')!;
    cell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const tip = document.querySelector<HTMLElement>('.heat-tooltip')!;
    expect(tip.hidden).toBe(false);
    expect(tip.classList.contains('is-visible')).toBe(true);

    cell.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    expect(tip.classList.contains('is-hiding')).toBe(true);
    expect(tip.hidden).toBe(false);

    vi.advanceTimersByTime(130);
    expect(tip.hidden).toBe(true);
    expect(tip.classList.contains('is-hiding')).toBe(false);
  });

  it('移动端点按：点格子显示，再点同一格子切换隐藏', () => {
    initHeatmapTooltips();
    const cell = document.querySelector('.heat-cell')!;
    cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const tip = document.querySelector<HTMLElement>('.heat-tooltip')!;
    expect(tip.hidden).toBe(false);
    expect(tip.classList.contains('is-visible')).toBe(true);
    expect(tip.textContent).toBe('3 contributions');

    // 再点同一格子：走 tipFor === cell 的切换关闭分支
    cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(tip.classList.contains('is-hiding')).toBe(true);
    vi.advanceTimersByTime(130);
    expect(tip.hidden).toBe(true);
  });

  it('点按格子以外的区域关闭已显示的气泡', () => {
    initHeatmapTooltips();
    const cell = document.querySelector('.heat-cell')!;
    cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const tip = document.querySelector<HTMLElement>('.heat-tooltip')!;
    expect(tip.hidden).toBe(false);

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(tip.classList.contains('is-hiding')).toBe(true);
    vi.advanceTimersByTime(130);
    expect(tip.hidden).toBe(true);
  });

  it('按下 Escape 关闭气泡', () => {
    initHeatmapTooltips();
    const cell = document.querySelector('.heat-cell')!;
    cell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const tip = document.querySelector<HTMLElement>('.heat-tooltip')!;
    expect(tip.hidden).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(tip.classList.contains('is-hiding')).toBe(true);
    vi.advanceTimersByTime(130);
    expect(tip.hidden).toBe(true);
  });

  it('热力图容器横向滚动时关闭气泡（位置已失效）', () => {
    initHeatmapTooltips();
    const cell = document.querySelector('.heat-cell')!;
    cell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const tip = document.querySelector<HTMLElement>('.heat-tooltip')!;
    expect(tip.hidden).toBe(false);

    // scroll 不冒泡，监听器靠 capture 阶段在 document 上收到
    document.querySelector('.heatmap-scroll')!.dispatchEvent(new Event('scroll'));
    expect(tip.classList.contains('is-hiding')).toBe(true);
    vi.advanceTimersByTime(130);
    expect(tip.hidden).toBe(true);
  });

  it('astro:before-swap 转场前销毁气泡节点，之后 hover 可重建新气泡', () => {
    initHeatmapTooltips();
    const cell = document.querySelector('.heat-cell')!;
    cell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const oldTip = document.querySelector<HTMLElement>('.heat-tooltip')!;
    expect(oldTip.hidden).toBe(false);

    document.dispatchEvent(new Event('astro:before-swap'));
    expect(oldTip.isConnected).toBe(false);
    expect(document.querySelector('.heat-tooltip')).toBeNull();

    // 引用已置空：再次 hover 重新创建气泡，且页面中始终只有一个气泡节点
    cell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const newTip = document.querySelector<HTMLElement>('.heat-tooltip')!;
    expect(newTip).not.toBe(oldTip);
    expect(newTip.hidden).toBe(false);
    expect(document.querySelectorAll('.heat-tooltip').length).toBe(1);
  });
});
