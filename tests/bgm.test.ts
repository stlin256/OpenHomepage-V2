/**
 * BGM 交互加载回归：预载永远不占用首屏带宽。
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { initBgm } from '../src/scripts/bgm.ts';

describe('initBgm', () => {
  it('autoplay first interaction starts loading instead of relying on preload', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
    const loads: string[] = [];
    document.body.innerHTML = [
      '<audio class="bgm-audio" src="/assets/bgm.mp3" preload="none" data-volume="0.4" data-autoplay="true"></audio>',
      '<button class="bgm-toggle" hidden></button>',
    ].join('');
    const audio = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    audio.load = () => loads.push('load');
    audio.play = vi.fn(() => Promise.resolve());

    initBgm();
    document.dispatchEvent(new MouseEvent('click'));

    expect(loads).toEqual(['load']);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.preload).toBe('none');
  });
});
