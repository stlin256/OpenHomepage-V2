/**
 * BGM 自动播放回归：首屏先机会性开播；被策略拦截时才交互加载。
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

let initBgm: () => void;

beforeEach(async () => {
  localStorage.clear();
  document.body.innerHTML = [
    '<audio class="bgm-audio" src="/assets/bgm.mp3" preload="none" data-volume="0.4" data-autoplay="true"></audio>',
    '<button class="bgm-toggle" hidden></button>',
  ].join('');
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches: false })),
  });
  vi.resetModules();
  ({ initBgm } = await import('../src/scripts/bgm.ts'));
});

describe('initBgm', () => {
  it('attempts autoplay during initialization without an eager load', () => {
    const audio = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    const loads: string[] = [];
    audio.load = () => loads.push('load');
    audio.play = vi.fn(() => Promise.resolve());

    initBgm();

    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(loads).toEqual([]);
    expect(audio.preload).toBe('none');
  });

  it('falls back to loading and playing after the first interaction when autoplay is blocked', () => {
    const audio = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    const loads: string[] = [];
    audio.load = () => loads.push('load');
    audio.play = vi.fn(() => Promise.resolve());

    initBgm();
    document.dispatchEvent(new MouseEvent('click'));

    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(loads).toEqual(['load']);
    expect(audio.preload).toBe('none');
  });
});
