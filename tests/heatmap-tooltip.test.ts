/**
 * 贡献热力图 tooltip：显示/隐藏状态类与延迟隐藏行为。
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
});
