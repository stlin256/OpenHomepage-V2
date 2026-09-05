/**
 * :::audio 自渲染播放器测试：初始化、播放/暂停互斥、进度跳转、
 * 滚动标题（marquee）与 BGM 淡出/渐显恢复。
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let initAudioPlayers: () => void;
let pauseOtherMedia: (current: HTMLMediaElement) => void;
let resumeBgmIfNeeded: () => void;
let setupAudioMarquee: (root?: ParentNode) => void;

beforeEach(async () => {
  document.documentElement.classList.remove('oh-edit');
  document.body.innerHTML = '';
  vi.resetModules();
  ({ initAudioPlayers, pauseOtherMedia, resumeBgmIfNeeded, setupAudioMarquee } = await import(
    '../src/scripts/audio-player.ts'
  ));
});

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.classList.remove('oh-edit');
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

/** 搭建 :::audio 播放器骨架 */
function buildPlayerHTML(attrs = ''): string {
  return [
    `<div class="audio-player" data-src="/media/song.mp3" ${attrs}>`,
    '  <button class="btn-toggle" aria-label="play"></button>',
    '  <div class="audio-track"><div class="audio-fill"></div></div>',
    '  <span class="audio-time"></span>',
    '  <div class="audio-scroll"><span data-marquee>很长的标题文本</span></div>',
    '</div>',
  ].join('');
}

/** 桩化媒体元素的 play/pause/load，并让 paused 随调用同步翻转 */
function stubMedia(el: HTMLMediaElement, initiallyPaused: boolean): void {
  Object.defineProperty(el, 'paused', { value: initiallyPaused, configurable: true, writable: true });
  el.play = vi.fn(() => {
    Object.defineProperty(el, 'paused', { value: false, configurable: true, writable: true });
    return Promise.resolve();
  }) as HTMLMediaElement['play'];
  el.pause = vi.fn(() => {
    Object.defineProperty(el, 'paused', { value: true, configurable: true, writable: true });
  }) as HTMLMediaElement['pause'];
  el.load = vi.fn();
}

/** 初始化单个播放器并返回根元素与其原生 audio */
function setupSinglePlayer(attrs = ''): { root: HTMLElement; audio: HTMLAudioElement } {
  document.body.innerHTML = buildPlayerHTML(attrs);
  initAudioPlayers();
  const root = document.querySelector<HTMLElement>('.audio-player')!;
  const audio = root.querySelector<HTMLAudioElement>('audio.audio-native')!;
  return { root, audio };
}

describe('initAudioPlayers 初始化', () => {
  it('按 data-* 创建原生 audio，重复调用不重复初始化', () => {
    const { root, audio } = setupSinglePlayer('data-preload="auto"');
    expect(audio.className).toBe('audio-native');
    expect(audio.preload).toBe('auto');
    expect(audio.src).toContain('/media/song.mp3');
    expect(root.dataset.audioInit).toBe('1');

    // 二次调用被 data-audio-init 守卫拦截
    initAudioPlayers();
    expect(root.querySelectorAll('audio')).toHaveLength(1);
  });

  it('非法 preload 回退为 metadata，省略时默认 metadata', () => {
    document.body.innerHTML = buildPlayerHTML('data-preload="weird"') + buildPlayerHTML('id="second"');
    initAudioPlayers();
    const players = document.querySelectorAll<HTMLElement>('.audio-player');
    expect(players[0]!.querySelector<HTMLAudioElement>('audio')!.preload).toBe('metadata');
    expect(players[1]!.querySelector<HTMLAudioElement>('audio')!.preload).toBe('metadata');
  });

  it('缺少 data-src 时标记已初始化但不创建 audio', () => {
    document.body.innerHTML = '<div class="audio-player"></div>';
    initAudioPlayers();
    const root = document.querySelector<HTMLElement>('.audio-player')!;
    expect(root.dataset.audioInit).toBe('1');
    expect(root.querySelector('audio')).toBeNull();
  });

  it('编辑模式（oh-edit）仅标记不初始化，保留 DOM 供检查器编辑', () => {
    document.documentElement.classList.add('oh-edit');
    document.body.innerHTML = `<div class="markdown-body">${buildPlayerHTML()}</div>`;
    initAudioPlayers();
    const root = document.querySelector<HTMLElement>('.audio-player')!;
    expect(root.dataset.audioInit).toBe('1');
    expect(root.querySelector('audio')).toBeNull();
  });

  it('仅绑定一次 resize 监听以重算滚动标题', () => {
    const spy = vi.spyOn(window, 'addEventListener');
    setupSinglePlayer();
    initAudioPlayers();
    const resizeBindings = spy.mock.calls.filter(([type]) => type === 'resize');
    expect(resizeBindings).toHaveLength(1);

    // 触发 resize 回调重算 marquee，安全无异常
    expect(() => window.dispatchEvent(new Event('resize'))).not.toThrow();
  });
});

describe('播放/暂停按钮', () => {
  it('暂停时点击：预载、播放并互斥打断其他媒体', async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<audio class="bgm-audio" data-volume="0.4" src="/bgm.mp3"></audio>' + buildPlayerHTML();
    initAudioPlayers();
    const bgm = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    stubMedia(bgm, false);
    bgm.volume = 0.4;
    const audio = document.querySelector<HTMLAudioElement>('audio.audio-native')!;
    stubMedia(audio, true);
    Object.defineProperty(audio, 'networkState', {
      value: HTMLMediaElement.NETWORK_EMPTY,
      configurable: true,
    });

    document.querySelector<HTMLElement>('.btn-toggle')!.click();
    await vi.advanceTimersByTimeAsync(1000);

    // networkState 为空时先 load 再 play
    expect(audio.load).toHaveBeenCalledTimes(1);
    expect(audio.play).toHaveBeenCalledTimes(1);
    // BGM 被淡出至静音并暂停
    expect(bgm.pause).toHaveBeenCalledTimes(1);
    expect(bgm.volume).toBe(0);
  });

  it('播放中点击：暂停自身并渐显恢复 BGM', async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<audio class="bgm-audio" data-volume="0.4" src="/bgm.mp3"></audio>' + buildPlayerHTML();
    initAudioPlayers();
    const bgm = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    stubMedia(bgm, false);
    bgm.volume = 0.4;
    const audio = document.querySelector<HTMLAudioElement>('audio.audio-native')!;
    stubMedia(audio, false);

    // 先让 BGM 进入“被打断”状态
    pauseOtherMedia(audio);
    await vi.advanceTimersByTimeAsync(1000);
    expect(bgm.pause).toHaveBeenCalledTimes(1);

    // 点击暂停当前音频 -> 恢复 BGM 并渐显回原音量
    document.querySelector<HTMLElement>('.btn-toggle')!.click();
    await vi.advanceTimersByTimeAsync(1000);
    expect(audio.pause).toHaveBeenCalled();
    expect(bgm.play).toHaveBeenCalledTimes(1);
    expect(bgm.volume).toBeCloseTo(0.4, 5);
  });

  it('播放请求被浏览器拒绝时静默忽略', async () => {
    const { audio } = setupSinglePlayer();
    Object.defineProperty(audio, 'networkState', { value: 2, configurable: true });
    audio.load = vi.fn();
    audio.play = vi.fn(() => Promise.reject(new Error('NotAllowedError'))) as HTMLMediaElement['play'];

    document.querySelector<HTMLElement>('.btn-toggle')!.click();
    await Promise.resolve();

    expect(audio.play).toHaveBeenCalledTimes(1);
    // networkState 非空时不重复 load
    expect(audio.load).not.toHaveBeenCalled();
  });
});

describe('进度条与时间显示', () => {
  it('点击进度条按比例跳转 currentTime', () => {
    const { audio } = setupSinglePlayer();
    Object.defineProperty(audio, 'duration', { value: 100, configurable: true });
    Object.defineProperty(audio, 'currentTime', { value: 0, writable: true, configurable: true });
    const track = document.querySelector<HTMLElement>('.audio-track')!;
    track.getBoundingClientRect = () =>
      ({ left: 0, width: 200, top: 0, right: 200, bottom: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    track.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 50 }));
    expect(audio.currentTime).toBe(25);
  });

  it('时长未知（duration 为 NaN/0）时点击进度条不跳转', () => {
    const { audio } = setupSinglePlayer();
    Object.defineProperty(audio, 'duration', { value: 0, configurable: true });
    Object.defineProperty(audio, 'currentTime', { value: 7, writable: true, configurable: true });

    document
      .querySelector<HTMLElement>('.audio-track')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 50 }));
    expect(audio.currentTime).toBe(7);
  });

  it('timeupdate 更新填充比例与时间文本，未知时长显示占位符', () => {
    const { audio } = setupSinglePlayer();
    const fill = document.querySelector<HTMLElement>('.audio-fill')!;
    const time = document.querySelector<HTMLElement>('.audio-time')!;

    // 时长未知：时间显示 --:--，填充不变
    Object.defineProperty(audio, 'duration', { value: NaN, configurable: true });
    Object.defineProperty(audio, 'currentTime', { value: 0, writable: true, configurable: true });
    audio.dispatchEvent(new Event('loadedmetadata'));
    expect(time.textContent).toBe('0:00 / --:--');
    expect(fill.style.transform).toBe('');

    // 已知时长：进度与时间正常渲染
    Object.defineProperty(audio, 'duration', { value: 100, configurable: true });
    audio.currentTime = 30;
    audio.dispatchEvent(new Event('timeupdate'));
    expect(fill.style.transform).toBe('scaleX(0.3)');
    expect(time.textContent).toBe('0:30 / 1:40');
  });
});

describe('播放状态事件', () => {
  it('play/pause/ended/error 事件切换 is-playing 样式', () => {
    const { root, audio } = setupSinglePlayer();

    audio.dispatchEvent(new Event('play'));
    expect(root.classList.contains('is-playing')).toBe(true);

    audio.dispatchEvent(new Event('pause'));
    expect(root.classList.contains('is-playing')).toBe(false);

    audio.dispatchEvent(new Event('play'));
    audio.dispatchEvent(new Event('ended'));
    expect(root.classList.contains('is-playing')).toBe(false);

    audio.dispatchEvent(new Event('play'));
    audio.dispatchEvent(new Event('error'));
    expect(root.classList.contains('is-playing')).toBe(false);
  });
});

describe('setupAudioMarquee 滚动标题', () => {
  it('溢出超过阈值时启用滚动位移，收缩后移除', () => {
    document.body.innerHTML = buildPlayerHTML();
    const holder = document.querySelector<HTMLElement>('.audio-scroll')!;
    const el = holder.querySelector<HTMLElement>('[data-marquee]')!;
    Object.defineProperty(holder, 'clientWidth', { value: 100, configurable: true });
    Object.defineProperty(el, 'scrollWidth', { value: 200, configurable: true });

    setupAudioMarquee();
    expect(holder.classList.contains('scrolling')).toBe(true);
    // 溢出 100px + 12px 缓冲
    expect(holder.style.getPropertyValue('--shift')).toBe('112px');

    // 收缩到不溢出：移除滚动态与位移变量
    Object.defineProperty(el, 'scrollWidth', { value: 100, configurable: true });
    setupAudioMarquee();
    expect(holder.classList.contains('scrolling')).toBe(false);
    expect(holder.style.getPropertyValue('--shift')).toBe('');
  });

  it('支持限定作用域 root，跳过无 .audio-scroll 祖先的节点', () => {
    document.body.innerHTML = [
      '<span data-marquee id="stray">游离节点</span>',
      '<div id="scope">',
      '  <div class="audio-scroll"><span data-marquee>标题</span></div>',
      '</div>',
    ].join('');
    const holder = document.querySelector<HTMLElement>('.audio-scroll')!;
    const el = holder.querySelector<HTMLElement>('[data-marquee]')!;
    Object.defineProperty(holder, 'clientWidth', { value: 100, configurable: true });
    Object.defineProperty(el, 'scrollWidth', { value: 200, configurable: true });

    // 默认 document 作用域：游离节点无 .audio-scroll 祖先被静默跳过
    expect(() => setupAudioMarquee()).not.toThrow();
    expect(holder.classList.contains('scrolling')).toBe(true);

    // 限定 root 作用域同样生效
    holder.classList.remove('scrolling');
    setupAudioMarquee(document.querySelector<HTMLElement>('#scope')!);
    expect(holder.classList.contains('scrolling')).toBe(true);
  });
});

describe('pauseOtherMedia / resumeBgmIfNeeded 互斥细节', () => {
  it('暂停其他正在播放的媒体并移除其根节点播放态', () => {
    document.body.innerHTML = [
      '<div class="audio-player is-playing" id="other"><audio src="/other.mp3"></audio></div>',
      '<audio id="cur" src="/cur.mp3"></audio>',
    ].join('');
    const other = document.querySelector<HTMLAudioElement>('#other audio')!;
    stubMedia(other, false);
    const current = document.querySelector<HTMLAudioElement>('#cur')!;
    stubMedia(current, true);

    pauseOtherMedia(current);
    expect(other.pause).toHaveBeenCalledTimes(1);
    expect(document.querySelector('#other')!.classList.contains('is-playing')).toBe(false);
    // current 自身不受影响
    expect(current.pause).not.toHaveBeenCalled();
  });

  it('仍有其他媒体播放时暂不恢复 BGM，全部结束后才恢复', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = [
      '<audio class="bgm-audio" data-volume="0.4" src="/bgm.mp3"></audio>',
      '<audio id="a" src="/a.mp3"></audio>',
      '<video id="v" src="/v.mp4"></video>',
    ].join('');
    const bgm = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    stubMedia(bgm, false);
    bgm.volume = 0.4;
    const a = document.querySelector<HTMLAudioElement>('#a')!;
    stubMedia(a, false);
    const v = document.querySelector<HTMLVideoElement>('#v')!;
    stubMedia(v, false);

    pauseOtherMedia(a);
    await vi.advanceTimersByTimeAsync(1000);
    expect(bgm.pause).toHaveBeenCalledTimes(1);

    // a 已停，但 v 随后又开始播放：BGM 暂不恢复
    Object.defineProperty(a, 'paused', { value: true, configurable: true });
    Object.defineProperty(v, 'paused', { value: false, configurable: true });
    resumeBgmIfNeeded();
    await Promise.resolve();
    expect(bgm.play).not.toHaveBeenCalled();

    // v 也结束：恢复播放并渐显回 0.4
    Object.defineProperty(v, 'paused', { value: true, configurable: true });
    resumeBgmIfNeeded();
    await vi.advanceTimersByTimeAsync(1000);
    expect(bgm.play).toHaveBeenCalledTimes(1);
    expect(bgm.volume).toBeCloseTo(0.4, 5);
  });

  it('BGM 未曾被打断或页面无 BGM 时 resumeBgmIfNeeded 为空操作', () => {
    // 无 BGM 元素：安全返回
    document.body.innerHTML = '';
    expect(() => resumeBgmIfNeeded()).not.toThrow();

    // 有 BGM 但未曾被 pauseOtherMedia 记录：不主动播放
    document.body.innerHTML = '<audio class="bgm-audio" data-volume="0.4" src="/bgm.mp3"></audio>';
    const bgm = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    stubMedia(bgm, true);
    resumeBgmIfNeeded();
    expect(bgm.play).not.toHaveBeenCalled();
  });

  it('页面无 BGM 时 pauseOtherMedia 只处理其余媒体', () => {
    document.body.innerHTML = '<audio id="x" src="/x.mp3"></audio><audio id="y" src="/y.mp3"></audio>';
    const x = document.querySelector<HTMLAudioElement>('#x')!;
    const y = document.querySelector<HTMLAudioElement>('#y')!;
    stubMedia(x, true);
    stubMedia(y, false);

    expect(() => pauseOtherMedia(x)).not.toThrow();
    expect(y.pause).toHaveBeenCalledTimes(1);
  });

  it('连续打断时清理上一段渐变定时器重新起淡', async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<audio class="bgm-audio" data-volume="0.4" src="/bgm.mp3"></audio><audio id="cur" src="/c.mp3"></audio>';
    const bgm = document.querySelector<HTMLAudioElement>('audio.bgm-audio')!;
    stubMedia(bgm, false);
    bgm.volume = 0.4;
    const cur = document.querySelector<HTMLAudioElement>('#cur')!;
    stubMedia(cur, true);

    pauseOtherMedia(cur);
    vi.advanceTimersByTime(80); // 渐变进行中再次打断：清旧定时器重新起
    pauseOtherMedia(cur);
    await vi.advanceTimersByTimeAsync(1000);

    expect(bgm.pause).toHaveBeenCalledTimes(1);
    expect(bgm.volume).toBe(0);
  });
});
