/**
 * BGM 自动播放回归与媒体打断恢复测试。
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let initBgm: () => void;
let pauseOtherMedia: (current: HTMLMediaElement) => void;
let resumeBgmIfNeeded: () => void;

/** 覆盖指定 media query 的 matchMedia 桩：predicate 命中才 matches */
function stubMatchMedia(predicate: (query: string) => boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({ matches: predicate(query) })),
  });
}

/** 搭建带双曲目播放列表的完整 .bgm-switcher 结构（遮罩 + 抽屉 + 控件） */
function buildSwitcherFixture(): void {
  const tracks = [
    { title: '第一首', artist: '甲', src: '/assets/a.mp3', cover: '/assets/a.jpg' },
    { title: '第二首', artist: '乙', src: '/assets/b.mp3' },
  ];
  document.body.innerHTML = [
    `<audio class="bgm-audio" src="/assets/a.mp3" preload="none" data-volume="0.4" data-tracks='${JSON.stringify(tracks)}'></audio>`,
    '<div class="bgm-switcher">',
    '  <button class="bgm-toggle" hidden aria-expanded="false"></button>',
    '  <div class="bgm-backdrop"></div>',
    '  <div class="bgm-drawer">',
    '    <div class="bgm-current-title"></div>',
    '    <div class="bgm-current-artist"></div>',
    '    <img class="bgm-current-cover" alt="" />',
    '    <button class="bgm-play-btn"><span class="icon-play"></span><span class="icon-pause"></span></button>',
    '    <button class="bgm-prev-btn"></button>',
    '    <button class="bgm-next-btn"></button>',
    '    <input class="bgm-volume-slider" type="range" min="0" max="1" step="0.01" />',
    tracks.map((t, i) => `<div class="bgm-track-item" data-track-index="${i}">${t.title}</div>`).join(''),
    '  </div>',
    '</div>',
  ].join('');
}

/** 桩化 audio 的 play/pause/load，并让 paused 随调用同步翻转 */
function stubAudioPlayback(audio: HTMLAudioElement, initiallyPaused = true): void {
  Object.defineProperty(audio, 'paused', { value: initiallyPaused, configurable: true, writable: true });
  audio.play = vi.fn(() => {
    Object.defineProperty(audio, 'paused', { value: false, configurable: true, writable: true });
    return Promise.resolve();
  });
  audio.pause = vi.fn(() => {
    Object.defineProperty(audio, 'paused', { value: true, configurable: true, writable: true });
  });
  audio.load = vi.fn();
}

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

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'mediaSession');
  document.body.innerHTML = '';
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
  it('does NOT autoplay when user previously paused BGM, even if data-autoplay="true" (tab switch regression fix)', () => {
    localStorage.setItem('bgm', '0'); // User explicitly paused BGM
    const audio = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    audio.play = vi.fn(() => Promise.resolve());

    // Simulate tab switch / page change re-calling initBgm
    initBgm();

    // Must not call play
    expect(audio.play).not.toHaveBeenCalled();

    // Further clicks or keydowns must not kickstart playback
    document.dispatchEvent(new MouseEvent('click'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Space' }));
    expect(audio.play).not.toHaveBeenCalled();
  });

  it('resumes playback when user previously played BGM (localStorage bgm=1)', () => {
    localStorage.setItem('bgm', '1');
    const audio = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    audio.play = vi.fn(() => Promise.resolve());

    initBgm();
    expect(audio.play).toHaveBeenCalledTimes(1);
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

describe('initBgm 播放列表与抽屉交互', () => {
  it('桌面端点击按钮切换播放与暂停并同步状态', () => {
    buildSwitcherFixture();
    const audio = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    stubAudioPlayback(audio);
    const btn = document.querySelector<HTMLElement>('.bgm-toggle')!;

    initBgm();
    expect(btn.hidden).toBe(false);

    // 暂停中点击：播放并记录用户偏好
    btn.click();
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('bgm')).toBe('1');
    expect(btn.classList.contains('playing')).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');

    // 播放中点击：暂停并记录用户偏好
    btn.click();
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('bgm')).toBe('0');
    expect(btn.classList.contains('playing')).toBe(false);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('移动端点击按钮开合抽屉，遮罩点击与 Esc 均可关闭', () => {
    stubMatchMedia((query) => query === '(max-width: 768px)');
    buildSwitcherFixture();
    const audio = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    stubAudioPlayback(audio);
    const btn = document.querySelector<HTMLElement>('.bgm-toggle')!;
    const drawer = document.querySelector<HTMLElement>('.bgm-drawer')!;

    initBgm();

    // 点按打开抽屉（移动端不触发播放/暂停）
    btn.click();
    expect(drawer.classList.contains('open')).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(audio.play).not.toHaveBeenCalled();

    // 再点按关闭
    btn.click();
    expect(drawer.classList.contains('open')).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('false');

    // 打开后点遮罩关闭
    btn.click();
    document.querySelector<HTMLElement>('.bgm-backdrop')!.click();
    expect(drawer.classList.contains('open')).toBe(false);

    // 打开后按 Esc 关闭
    btn.click();
    expect(drawer.classList.contains('open')).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(drawer.classList.contains('open')).toBe(false);
  });

  it('点击上一首/下一首按钮循环切换曲目', () => {
    buildSwitcherFixture();
    const audio = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    stubAudioPlayback(audio);

    initBgm();
    expect(audio.src).toContain('/assets/a.mp3');

    // 下一首：0 -> 1
    document.querySelector<HTMLElement>('.bgm-next-btn')!.click();
    expect(audio.src).toContain('/assets/b.mp3');
    expect(localStorage.getItem('oh-bgm-track')).toBe('1');
    expect(audio.play).toHaveBeenCalled();

    // 下一首：1 -> 回绕到 0
    document.querySelector<HTMLElement>('.bgm-next-btn')!.click();
    expect(audio.src).toContain('/assets/a.mp3');
    expect(localStorage.getItem('oh-bgm-track')).toBe('0');

    // 上一首：0 -> 回绕到末位 1
    document.querySelector<HTMLElement>('.bgm-prev-btn')!.click();
    expect(audio.src).toContain('/assets/b.mp3');
    expect(localStorage.getItem('oh-bgm-track')).toBe('1');
  });

  it('点击播放列表项切换到对应曲目并同步高亮与封面', () => {
    buildSwitcherFixture();
    const audio = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    stubAudioPlayback(audio);

    initBgm();
    const items = document.querySelectorAll<HTMLElement>('.bgm-track-item');
    const cover = document.querySelector<HTMLImageElement>('.bgm-current-cover')!;
    expect(cover.getAttribute('src')).toBe('/assets/a.jpg');
    expect(items[0]!.classList.contains('active')).toBe(true);

    items[1]!.click();
    expect(audio.src).toContain('/assets/b.mp3');
    expect(audio.play).toHaveBeenCalled();
    expect(items[1]!.classList.contains('active')).toBe(true);
    expect(items[1]!.getAttribute('aria-current')).toBe('true');
    expect(items[0]!.classList.contains('active')).toBe(false);
    expect(items[0]!.getAttribute('aria-current')).toBeNull();
    // 第二首无封面：清空 src 并回退艺术家显示
    expect(cover.getAttribute('src')).toBe('');
    expect(document.querySelector('.bgm-current-title')!.textContent).toBe('第二首');
    expect(document.querySelector('.bgm-current-artist')!.textContent).toBe('乙');
  });

  it('忽略 data-track-index 非法的列表项点击', () => {
    buildSwitcherFixture();
    // 在初始化前放入一个索引非法的列表项，确保绑定了监听器但被整数校验拦截
    const stray = document.createElement('div');
    stray.className = 'bgm-track-item';
    stray.dataset.trackIndex = 'not-a-number';
    document.querySelector('.bgm-drawer')!.appendChild(stray);
    const audio = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    stubAudioPlayback(audio);

    initBgm();
    stray.click();
    expect(audio.src).toContain('/assets/a.mp3');
    expect(audio.play).not.toHaveBeenCalled();
    expect(localStorage.getItem('oh-bgm-track')).toBeNull();
  });

  it('拖动音量滑条更新音量并持久化', () => {
    buildSwitcherFixture();
    const audio = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    stubAudioPlayback(audio);

    initBgm();
    const slider = document.querySelector<HTMLInputElement>('.bgm-volume-slider')!;
    expect(slider.value).toBe('0.4');

    slider.value = '0.8';
    slider.dispatchEvent(new Event('input'));
    expect(audio.volume).toBe(0.8);
    expect(localStorage.getItem('oh-bgm-volume')).toBe('0.8');

    // 超出范围会被钳制到 [0, 1]
    slider.value = '5';
    slider.dispatchEvent(new Event('input'));
    expect(audio.volume).toBe(1);
  });

  it('多曲目播放结束自动切到下一首，加载出错时跳过一次', () => {
    buildSwitcherFixture();
    const audio = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    stubAudioPlayback(audio);

    initBgm();
    audio.dispatchEvent(new Event('ended'));
    expect(audio.src).toContain('/assets/b.mp3');
    expect(audio.play).toHaveBeenCalled();

    // error 事件：当前未播放（paused）时切歌但不自动播放
    Object.defineProperty(audio, 'paused', { value: true, configurable: true });
    (audio.play as ReturnType<typeof vi.fn>).mockClear();
    audio.dispatchEvent(new Event('error'));
    expect(audio.src).toContain('/assets/a.mp3');
    expect(audio.play).not.toHaveBeenCalled();
  });

  it('data-tracks 非法 JSON 时回退为单曲目且不自动连播', () => {
    document.body.innerHTML = [
      '<audio class="bgm-audio" src="/assets/bgm.mp3" preload="none" data-volume="0.4" data-tracks="{oops"></audio>',
      '<div class="bgm-switcher">',
      '  <button class="bgm-toggle" hidden></button>',
      '  <div class="bgm-drawer"><div class="bgm-current-title"></div></div>',
      '</div>',
    ].join('');
    const audio = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    stubAudioPlayback(audio);

    initBgm();
    expect(document.querySelector('.bgm-current-title')!.textContent).toBe('BGM');

    // 单曲目：ended 不触发切歌
    audio.dispatchEvent(new Event('ended'));
    expect(audio.play).not.toHaveBeenCalled();
    expect(audio.src).toContain('/assets/bgm.mp3');
  });

  it('偏好减少动态时隐藏控件并提前返回', () => {
    stubMatchMedia((query) => query.includes('prefers-reduced-motion'));
    const audio = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    stubAudioPlayback(audio);
    const btn = document.querySelector<HTMLElement>('.bgm-toggle')!;

    initBgm();
    expect(btn.hidden).toBe(true);
    expect(audio.play).not.toHaveBeenCalled();
  });

  it('自动播放待命中发现用户已暂停时解除首次交互恢复（不再偷播）', () => {
    // 默认夹具带 data-autoplay="true" 且无本地偏好 -> kick 待命
    const audio = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    stubAudioPlayback(audio);

    initBgm();
    expect(audio.play).toHaveBeenCalledTimes(1);

    // 用户在别处已明确暂停：首次交互应解除 kick 而不是重新播放
    localStorage.setItem('bgm', '0');
    Object.defineProperty(audio, 'paused', { value: true, configurable: true });
    document.dispatchEvent(new MouseEvent('click'));
    expect(audio.play).toHaveBeenCalledTimes(1);

    // kick 已解除：后续交互也不再触发播放
    document.dispatchEvent(new MouseEvent('click'));
    document.dispatchEvent(new KeyboardEvent('keydown'));
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('抽屉内播放键在暂停时恢复播放并记录偏好', () => {
    buildSwitcherFixture();
    const audio = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    stubAudioPlayback(audio);

    initBgm();
    document.querySelector<HTMLElement>('.bgm-play-btn')!.click();
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('bgm')).toBe('1');
  });

  it('无 data-volume 时回退默认音量，本地已存音量优先', () => {
    // 无 data-volume：clampVolume(undefined) 回退 0.4
    document.body.innerHTML = [
      '<audio class="bgm-audio" src="/assets/bgm.mp3" preload="none"></audio>',
      '<button class="bgm-toggle" hidden></button>',
    ].join('');
    const audio = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    stubAudioPlayback(audio);
    initBgm();
    expect(audio.volume).toBe(0.4);

    // 本地已存音量：覆盖默认值
    localStorage.setItem('oh-bgm-volume', '0.7');
    document.body.innerHTML = [
      '<audio class="bgm-audio" src="/assets/bgm.mp3" preload="none" data-volume="0.4"></audio>',
      '<button class="bgm-toggle" hidden></button>',
    ].join('');
    const audio2 = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    stubAudioPlayback(audio2);
    initBgm();
    expect(audio2.volume).toBe(0.7);
  });

  it('localStorage 读取抛异常时静默降级为无偏好', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    // 默认夹具带 data-autoplay="true"：读取失败视为无偏好，仍按配置自动播放
    const audio = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    stubAudioPlayback(audio);

    expect(() => initBgm()).not.toThrow();
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('支持 MediaSession 时写入元数据并注册播放/切歌动作', () => {
    const handlers: Record<string, () => void> = {};
    const session: { metadata: unknown; setActionHandler: (a: string, cb: () => void) => void } = {
      metadata: null,
      setActionHandler: (action, cb) => {
        handlers[action] = cb;
      },
    };
    Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: session });
    vi.stubGlobal(
      'MediaMetadata',
      class {
        constructor(public init: unknown) {}
      },
    );
    buildSwitcherFixture();
    const audio = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    stubAudioPlayback(audio);

    initBgm();

    // 初始化即写入当前曲目元数据（含封面 artwork）
    const metadata = session.metadata as { init: { title: string; artwork: unknown[] } };
    expect(metadata.init.title).toBe('第一首');
    expect(metadata.init.artwork).toHaveLength(1);
    expect(handlers.play).toBeTypeOf('function');
    expect(handlers.pause).toBeTypeOf('function');
    expect(handlers.previoustrack).toBeTypeOf('function');
    expect(handlers.nexttrack).toBeTypeOf('function');

    // 媒体键切歌：nexttrack 触发 switchTrack
    handlers.nexttrack!();
    expect(audio.src).toContain('/assets/b.mp3');

    // 媒体键播放/暂停直达 audio
    handlers.pause!();
    expect(audio.pause).toHaveBeenCalled();
    handlers.play!();
    expect(audio.play).toHaveBeenCalled();
  });
});
