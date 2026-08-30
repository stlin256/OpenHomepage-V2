/**
 * BGM 自动播放回归与媒体打断恢复测试。
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

let initBgm: () => void;
let pauseOtherMedia: (current: HTMLMediaElement) => void;
let resumeBgmIfNeeded: () => void;

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
  ({ pauseOtherMedia, resumeBgmIfNeeded } = await import('../src/scripts/audio-player.ts'));
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

  it('does not restart BGM when the drawer pause control is clicked while autoplay kick is armed', () => {
    document.body.innerHTML = [
      '<audio class="bgm-audio" src="/assets/bgm.mp3" preload="none" data-volume="0.4" data-autoplay="true"></audio>',
      '<div class="bgm-switcher">',
      '  <button class="bgm-toggle" hidden></button>',
      '  <div class="bgm-drawer"><button class="bgm-play-btn" aria-label="Play/Pause"></button></div>',
      '</div>',
    ].join('');
    const audio = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    audio.play = vi.fn(() => Promise.resolve());
    audio.pause = vi.fn(() => {
      Object.defineProperty(audio, 'paused', { value: true, configurable: true });
    });

    initBgm();
    // Simulate playback having started after initialization (for example, a
    // browser resolving the play request after the kick listener was armed).
    Object.defineProperty(audio, 'paused', { value: false, configurable: true });
    document.querySelector<HTMLButtonElement>('.bgm-play-btn')!.click();

    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.paused).toBe(true);
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

describe('media interruption & auto-resume', () => {
  it('smoothly pauses BGM when another media starts, and automatically resumes BGM when other media ends', async () => {
    vi.useFakeTimers();
    const bgm = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    bgm.volume = 0.4;
    bgm.play = vi.fn(() => {
      Object.defineProperty(bgm, 'paused', { value: false, configurable: true });
      return Promise.resolve();
    });
    bgm.pause = vi.fn(() => {
      Object.defineProperty(bgm, 'paused', { value: true, configurable: true });
    });

    // Start playing BGM
    await bgm.play();
    expect(bgm.paused).toBe(false);

    // Create a content video/audio element
    const video = document.createElement('video');
    document.body.appendChild(video);
    Object.defineProperty(video, 'paused', { value: false, configurable: true });

    // When video starts playing, pauseOtherMedia is called
    pauseOtherMedia(video);
    vi.advanceTimersByTime(1000);
    expect(bgm.pause).toHaveBeenCalled();

    // Now video pauses/ends
    Object.defineProperty(video, 'paused', { value: true, configurable: true });
    resumeBgmIfNeeded();
    await Promise.resolve();
    vi.advanceTimersByTime(1000);

    // BGM should be resumed
    expect(bgm.play).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});