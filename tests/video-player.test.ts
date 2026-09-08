/**
 * :::video 自渲染视频播放器测试：初始化、播放/暂停、BGM 互斥联动、
 * 进度条拖拽/时间显示、倍速、音量、全屏/画中画、顶栏渐隐与键盘快捷键。
 *
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let initVideoPlayers: () => void;
let formatTime: (sec: number) => string;
let pauseOtherMedia: (current: HTMLMediaElement) => void;

beforeEach(async () => {
  document.documentElement.classList.remove('oh-edit');
  document.body.innerHTML = '';
  vi.resetModules();
  ({ initVideoPlayers, formatTime } = await import('../src/scripts/video-player.ts'));
  ({ pauseOtherMedia } = await import('../src/scripts/audio-player.ts'));
});

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.classList.remove('oh-edit');
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

/** 搭建 :::video 播放器骨架（对齐 Scheme B 结构） */
function buildVideoPlayerHTML(attrs = ''): string {
  return [
    `<div class="video-player md-video" data-src="/media/flower.mp4" ${attrs} tabindex="0">`,
    '  <video class="video-element" src="/media/flower.mp4" preload="metadata"></video>',
    '  <div class="video-scrim"></div>',
    '  <div class="video-topbar">',
    '    <div class="video-top-title-group">',
    '      <span class="video-top-badge">4K</span>',
    '      <span class="video-top-title">花卉特写</span>',
    '    </div>',
    '  </div>',
    '  <button class="video-big-play" type="button" aria-label="播放">',
    '    <svg class="icon-big-play"><path d="M8.5 6.8..."></path></svg>',
    '  </button>',
    '  <div class="video-spinner"></div>',
    '  <div class="video-controls">',
    '    <div class="video-progress-wrap" role="slider">',
    '      <div class="video-progress-tooltip">00:00</div>',
    '      <div class="video-progress-rail">',
    '        <div class="video-progress-buffer"></div>',
    '        <div class="video-progress-played"><div class="video-progress-thumb"></div></div>',
    '      </div>',
    '    </div>',
    '    <div class="video-ctrl-row">',
    '      <div class="video-ctrl-group left">',
    '        <button class="video-btn btn-play-pause" type="button">',
    '          <svg class="icon-play"></svg>',
    '          <svg class="icon-pause" style="display: none;"></svg>',
    '          <svg class="icon-replay" style="display: none;"></svg>',
    '        </button>',
    '        <div class="video-volume-wrap">',
    '          <button class="video-btn btn-volume" type="button">',
    '            <svg class="icon-vol-high"></svg>',
    '            <svg class="icon-vol-low" style="display: none;"></svg>',
    '            <svg class="icon-vol-mute" style="display: none;"></svg>',
    '          </button>',
    '          <div class="video-volume-box">',
    '            <div class="video-volume-rail"><div class="video-volume-fill"></div></div>',
    '          </div>',
    '        </div>',
    '        <div class="video-time">',
    '          <span class="video-time-cur">00:00</span>',
    '          <span class="sep">/</span>',
    '          <span class="video-time-dur">--:--</span>',
    '        </div>',
    '      </div>',
    '      <div class="video-ctrl-group right">',
    '        <div class="video-speed-wrap">',
    '          <button class="video-btn btn-speed" type="button">1.0x</button>',
    '          <div class="video-speed-menu">',
    '            <div class="speed-item" data-speed="0.5">0.5x</div>',
    '            <div class="speed-item active" data-speed="1.0">1.0x</div>',
    '            <div class="speed-item" data-speed="1.5">1.5x</div>',
    '            <div class="speed-item" data-speed="2.0">2.0x</div>',
    '          </div>',
    '        </div>',
    '        <button class="video-btn btn-pip" type="button"></button>',
    '        <button class="video-btn btn-fullscreen" type="button">',
    '          <svg class="icon-fs-enter"></svg>',
    '          <svg class="icon-fs-exit" style="display: none;"></svg>',
    '        </button>',
    '      </div>',
    '    </div>',
    '  </div>',
    '</div>',
  ].join('');
}

/** 桩化媒体元素的方法与属性 */
function stubMedia(el: HTMLMediaElement, initiallyPaused = true): void {
  Object.defineProperty(el, 'paused', { value: initiallyPaused, configurable: true, writable: true });
  el.play = vi.fn(() => {
    Object.defineProperty(el, 'paused', { value: false, configurable: true, writable: true });
    el.dispatchEvent(new Event('play'));
    return Promise.resolve();
  }) as HTMLMediaElement['play'];
  el.pause = vi.fn(() => {
    Object.defineProperty(el, 'paused', { value: true, configurable: true, writable: true });
    el.dispatchEvent(new Event('pause'));
  }) as HTMLMediaElement['pause'];
  el.load = vi.fn();
}

/** 初始化单个视频播放器并返回其 DOM 节点 */
function setupSingleVideoPlayer(attrs = ''): { root: HTMLElement; video: HTMLVideoElement } {
  document.body.innerHTML = buildVideoPlayerHTML(attrs);
  const root = document.querySelector<HTMLElement>('.video-player')!;
  const video = root.querySelector<HTMLVideoElement>('video.video-element')!;
  stubMedia(video, true);
  initVideoPlayers();
  return { root, video };
}

describe('视频播放器布局回归', () => {
  it('画幅内覆盖模式清除原生 video 的外边距与边框，避免顶部黑边', () => {
    const css = readFileSync('src/styles/home-blocks.css', 'utf8');
    const start = css.indexOf('.markdown-body .video-element {');
    const end = css.indexOf('}', start);
    const rule = css.slice(start, end);
    expect(rule).toContain('margin: 0;');
    expect(rule).toContain('border: 0;');
  });
});

describe('formatTime 辅助函数', () => {
  it('正确格式化秒数与异常边界', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(9)).toBe('00:09');
    expect(formatTime(75)).toBe('01:15');
    expect(formatTime(3665)).toBe('61:05');
    expect(formatTime(NaN)).toBe('00:00');
    expect(formatTime(-10)).toBe('00:00');
    expect(formatTime(Infinity)).toBe('00:00');
  });
});

describe('initVideoPlayers 初始化与守卫', () => {
  it('成功初始化并标记 data-video-init，二次调用防重', () => {
    const { root } = setupSingleVideoPlayer();
    expect(root.dataset.videoInit).toBe('1');

    const clickSpy = vi.spyOn(root, 'addEventListener');
    initVideoPlayers();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('容器内无 video 元素时安全跳过', () => {
    document.body.innerHTML = '<div class="video-player"></div>';
    expect(() => initVideoPlayers()).not.toThrow();
    const root = document.querySelector<HTMLElement>('.video-player')!;
    expect(root.dataset.videoInit).toBe('1');
  });

  it('编辑模式（oh-edit）仅打标不绑定事件', () => {
    document.documentElement.classList.add('oh-edit');
    document.body.innerHTML = `<div class="markdown-body">${buildVideoPlayerHTML()}</div>`;
    initVideoPlayers();
    const root = document.querySelector<HTMLElement>('.video-player')!;
    expect(root.dataset.videoInit).toBe('1');
  });
});

describe('播放与暂停交互及互斥联动', () => {
  it('点击大播放按钮或控制条播放键：播放并暂停全局 BGM', async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<audio class="bgm-audio" data-volume="0.4" src="/bgm.mp3"></audio>' + buildVideoPlayerHTML();
    const bgm = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    stubMedia(bgm, false);
    bgm.volume = 0.4;

    const root = document.querySelector<HTMLElement>('.video-player')!;
    const video = root.querySelector<HTMLVideoElement>('video.video-element')!;
    stubMedia(video, true);
    initVideoPlayers();

    const bigPlay = root.querySelector<HTMLElement>('.video-big-play')!;
    bigPlay.click();
    await vi.advanceTimersByTimeAsync(1000);

    expect(video.play).toHaveBeenCalledTimes(1);
    expect(root.classList.contains('is-playing')).toBe(true);
    // BGM 被打断淡出暂停
    expect(bgm.pause).toHaveBeenCalledTimes(1);
    expect(bgm.volume).toBe(0);
  });

  it('播放中点击视频或播放键：暂停自身并恢复 BGM', async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<audio class="bgm-audio" data-volume="0.4" src="/bgm.mp3"></audio>' + buildVideoPlayerHTML();
    const bgm = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    stubMedia(bgm, false);
    bgm.volume = 0.4;

    const root = document.querySelector<HTMLElement>('.video-player')!;
    const video = root.querySelector<HTMLVideoElement>('video.video-element')!;
    stubMedia(video, false);
    initVideoPlayers();

    // 先让视频播放打断 BGM
    pauseOtherMedia(video);
    await vi.advanceTimersByTimeAsync(1000);
    expect(bgm.pause).toHaveBeenCalledTimes(1);

    // 点击视频暂停
    video.click();
    await vi.advanceTimersByTimeAsync(1000);

    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(root.classList.contains('is-playing')).toBe(false);
    expect(bgm.play).toHaveBeenCalledTimes(1);
    expect(bgm.volume).toBeCloseTo(0.4, 5);
  });

  it('视频播放被阻止时静默处理', async () => {
    const { video } = setupSingleVideoPlayer();
    video.play = vi.fn(() => Promise.reject(new Error('NotAllowedError'))) as HTMLMediaElement['play'];

    const btnPlay = document.querySelector<HTMLElement>('.btn-play-pause')!;
    btnPlay.click();
    await Promise.resolve();

    expect(video.play).toHaveBeenCalledTimes(1);
  });
});

describe('播放状态与顶栏/图标状态翻转', () => {
  it('play/pause/ended 事件切换 is-playing 与播放/暂停/重播图标', () => {
    const { root, video } = setupSingleVideoPlayer();
    const iconPlay = root.querySelector<HTMLElement>('.icon-play')!;
    const iconPause = root.querySelector<HTMLElement>('.icon-pause')!;
    const iconReplay = root.querySelector<HTMLElement>('.icon-replay')!;

    // play
    video.dispatchEvent(new Event('play'));
    expect(root.classList.contains('is-playing')).toBe(true);
    expect(iconPlay.style.display).toBe('none');
    expect(iconPause.style.display).toBe('block');
    expect(iconReplay.style.display).toBe('none');

    // pause
    video.dispatchEvent(new Event('pause'));
    expect(root.classList.contains('is-playing')).toBe(false);
    expect(iconPlay.style.display).toBe('block');
    expect(iconPause.style.display).toBe('none');

    // ended
    video.dispatchEvent(new Event('ended'));
    expect(root.classList.contains('is-playing')).toBe(false);
    expect(iconReplay.style.display).toBe('block');
    expect(iconPlay.style.display).toBe('none');

    // waiting / playing 缓冲状态
    video.dispatchEvent(new Event('waiting'));
    expect(root.classList.contains('is-buffering')).toBe(true);

    video.dispatchEvent(new Event('playing'));
    expect(root.classList.contains('is-buffering')).toBe(false);
    expect(root.classList.contains('is-playing')).toBe(true);
  });
});

describe('进度条、时间更新与拖拽跳转', () => {
  it('loadedmetadata / durationchange 更新总时长', () => {
    const { video } = setupSingleVideoPlayer();
    Object.defineProperty(video, 'duration', { value: 120, configurable: true });
    Object.defineProperty(video, 'currentTime', { value: 15, configurable: true });

    video.dispatchEvent(new Event('loadedmetadata'));
    expect(document.querySelector('.video-time-dur')!.textContent).toBe('02:00');
    expect(document.querySelector('.video-time-cur')!.textContent).toBe('00:15');
  });

  it('timeupdate 按 scaleX 复合属性驱动进度条，不引起 layout 回流', () => {
    const { video } = setupSingleVideoPlayer();
    Object.defineProperty(video, 'duration', { value: 100, configurable: true });
    Object.defineProperty(video, 'currentTime', { value: 40, configurable: true });

    video.dispatchEvent(new Event('timeupdate'));
    const played = document.querySelector<HTMLElement>('.video-progress-played')!;
    expect(played.style.transform).toBe('scaleX(0.4)');
    expect(document.querySelector('.video-time-cur')!.textContent).toBe('00:40');
  });

  it('progress 事件更新缓冲比例', () => {
    const { video } = setupSingleVideoPlayer();
    Object.defineProperty(video, 'duration', { value: 100, configurable: true });
    Object.defineProperty(video, 'buffered', {
      value: {
        length: 1,
        end: () => 60,
      },
      configurable: true,
    });

    video.dispatchEvent(new Event('progress'));
    const buffer = document.querySelector<HTMLElement>('.video-progress-buffer')!;
    expect(buffer.style.transform).toBe('scaleX(0.6)');
  });

  it('鼠标在进度条上移动更新 tooltip 悬浮气泡', () => {
    const { video } = setupSingleVideoPlayer();
    Object.defineProperty(video, 'duration', { value: 200, configurable: true });
    const wrap = document.querySelector<HTMLElement>('.video-progress-wrap')!;
    const tooltip = document.querySelector<HTMLElement>('.video-progress-tooltip')!;
    wrap.getBoundingClientRect = () =>
      ({ left: 0, width: 200, top: 0, right: 200, bottom: 0, height: 18, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    wrap.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 50 }));
    expect(tooltip.textContent).toBe('00:50');
    expect(tooltip.style.left).toBe('50px');
  });

  it('鼠标拖拽进度条结束时更新 video.currentTime', () => {
    const { video } = setupSingleVideoPlayer();
    Object.defineProperty(video, 'duration', { value: 100, configurable: true });
    Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true });
    const wrap = document.querySelector<HTMLElement>('.video-progress-wrap')!;
    wrap.getBoundingClientRect = () =>
      ({ left: 0, width: 200, top: 0, right: 200, bottom: 0, height: 18, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    wrap.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100 }));
    expect(wrap.classList.contains('is-dragging')).toBe(true);

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 150 }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 150 }));

    expect(wrap.classList.contains('is-dragging')).toBe(false);
    expect(video.currentTime).toBe(75);
  });
});

describe('音量控制与静音翻转', () => {
  it('点击音量按钮切换静音，点击音量轨设置具体比例', () => {
    const { video } = setupSingleVideoPlayer();
    Object.defineProperty(video, 'volume', { value: 0.8, writable: true, configurable: true });
    Object.defineProperty(video, 'muted', { value: false, writable: true, configurable: true });

    const btnVol = document.querySelector<HTMLElement>('.btn-volume')!;
    btnVol.click();
    expect(video.muted).toBe(true);

    btnVol.click();
    expect(video.muted).toBe(false);
    expect(video.volume).toBe(0.8);

    // 点击音量滑条
    const rail = document.querySelector<HTMLElement>('.video-volume-rail')!;
    rail.getBoundingClientRect = () =>
      ({ left: 0, width: 100, top: 0, right: 100, bottom: 0, height: 4, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    rail.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 30 }));
    expect(video.volume).toBe(0.3);
    expect(document.querySelector<HTMLElement>('.icon-vol-low')!.style.display).toBe('block');
  });
});

describe('倍速面板与切换', () => {
  it('展开倍速菜单并选择倍速，更新 playbackRate 与按钮文字', () => {
    const { video } = setupSingleVideoPlayer();
    const btnSpeed = document.querySelector<HTMLElement>('.btn-speed')!;
    const menu = document.querySelector<HTMLElement>('.video-speed-menu')!;

    btnSpeed.click();
    expect(menu.classList.contains('show')).toBe(true);

    const item15 = menu.querySelector<HTMLElement>('[data-speed="1.5"]')!;
    item15.click();

    expect(video.playbackRate).toBe(1.5);
    expect(btnSpeed.textContent).toBe('1.5x');
    expect(menu.classList.contains('show')).toBe(false);

    // 点击外部收起菜单
    btnSpeed.click();
    expect(menu.classList.contains('show')).toBe(true);
    document.dispatchEvent(new MouseEvent('click'));
    expect(menu.classList.contains('show')).toBe(false);
  });
});

describe('画中画与全屏交互', () => {
  it('点击画中画按钮调用 requestPictureInPicture / exitPictureInPicture', () => {
    const { video } = setupSingleVideoPlayer();
    const mockRequestPip = vi.fn(() => Promise.resolve({}));
    (video as unknown as { requestPictureInPicture: unknown }).requestPictureInPicture = mockRequestPip;

    const btnPip = document.querySelector<HTMLElement>('.btn-pip')!;
    btnPip.click();
    expect(mockRequestPip).toHaveBeenCalledTimes(1);
  });

  it('点击全屏按钮调用 requestFullscreen，并在 fullscreenchange 切换图标', () => {
    const { root } = setupSingleVideoPlayer();
    const mockRequestFs = vi.fn(() => Promise.resolve());
    root.requestFullscreen = mockRequestFs;

    const btnFs = document.querySelector<HTMLElement>('.btn-fullscreen')!;
    btnFs.click();
    expect(mockRequestFs).toHaveBeenCalledTimes(1);

    // 触发 fullscreenchange 模拟全屏
    Object.defineProperty(document, 'fullscreenElement', { value: root, configurable: true });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(root.querySelector<HTMLElement>('.icon-fs-enter')!.style.display).toBe('none');
    expect(root.querySelector<HTMLElement>('.icon-fs-exit')!.style.display).toBe('block');

    // 退出全屏
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(root.querySelector<HTMLElement>('.icon-fs-enter')!.style.display).toBe('block');
    expect(root.querySelector<HTMLElement>('.icon-fs-exit')!.style.display).toBe('none');
  });
});

describe('空闲自动隐藏控制条 (Auto-hide on Idle)', () => {
  it('播放中 2.5 秒无交互时添加 is-idle，指针动作移除 is-idle', () => {
    vi.useFakeTimers();
    const { root, video } = setupSingleVideoPlayer();

    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    video.dispatchEvent(new Event('play'));
    expect(root.classList.contains('is-idle')).toBe(false);

    vi.advanceTimersByTime(2600);
    expect(root.classList.contains('is-idle')).toBe(true);

    root.dispatchEvent(new MouseEvent('mousemove'));
    expect(root.classList.contains('is-idle')).toBe(false);
  });
});

describe('键盘快捷键无障碍支持', () => {
  it('支持 Space、方向键、M、F 及数字键跳转', () => {
    const { root, video } = setupSingleVideoPlayer();
    Object.defineProperty(video, 'duration', { value: 100, configurable: true });
    Object.defineProperty(video, 'currentTime', { value: 50, writable: true, configurable: true });
    Object.defineProperty(video, 'volume', { value: 0.5, writable: true, configurable: true });
    Object.defineProperty(video, 'muted', { value: false, writable: true, configurable: true });

    // Space: 播放/暂停
    root.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(video.play).toHaveBeenCalledTimes(1);

    // Left arrow: 快退 5 秒
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(video.currentTime).toBe(45);

    // Right arrow: 快进 5 秒
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(video.currentTime).toBe(50);

    // Up arrow: 音量 +0.1
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(video.volume).toBeCloseTo(0.6, 5);

    // Down arrow: 音量 -0.1
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(video.volume).toBeCloseTo(0.5, 5);

    // M: 静音
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
    expect(video.muted).toBe(true);

    // 数字键 3: 跳至 30%
    root.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));
    expect(video.currentTime).toBe(30);
  });
});

describe('原生/未包装 video 标签的互斥兜底', () => {
  it('页面存在未包装的裸 video 时依然保证 BGM 互斥', () => {
    document.body.innerHTML = '<div class="markdown-body"><video id="raw-v" src="/raw.mp4"></video></div>';
    const raw = document.querySelector<HTMLVideoElement>('#raw-v')!;
    stubMedia(raw, true);

    initVideoPlayers();
    expect(raw.dataset.mediaLoaded).toBe('1');
  });
});
