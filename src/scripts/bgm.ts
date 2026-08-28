/**
 * 背景音乐（site.yaml bgm 段）：
 * - <audio class="bgm-audio"> 在 BaseLayout 渲染，客户端内容交换不触碰它；
 * - 播放/暂停按钮在 header 内，header 不参与内容交换，监听持久；
 * - 音频始终 preload=none；autoplay 或 localStorage 记忆播放态时，初始化即调用
 *   play() 机会性开播；若被浏览器自动播放策略拦截，再在首次用户交互后兜底播放。
 */

const STORAGE_KEY = 'bgm';

/** 模块级标记：kick 是否已挂（防止重复挂监听） */
let kickArmed = false;

function readSaved(): '1' | '0' | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === '1' || v === '0' ? v : null;
  } catch {
    return null;
  }
}

function writeSaved(v: '1' | '0'): void {
  try {
    localStorage.setItem(STORAGE_KEY, v);
  } catch {
    /* 存储不可用时仅当页生效 */
  }
}

function clampVolume(raw: string | undefined): number {
  const v = Number(raw);
  if (!Number.isFinite(v)) return 0.4;
  return Math.min(1, Math.max(0, v));
}

function playAudio(audio: HTMLAudioElement, loadFirst = true): void {
  // 交互触发的播放先显式进入资源加载流程，避免 preload=none 的惰性调度拖延；
  // 首屏机会性播放则直接调用 play()，让浏览器只在允许自动播放时才开始取媒体。
  if (loadFirst && audio.networkState === HTMLMediaElement.NETWORK_EMPTY) audio.load();
  void audio.play().catch(() => {});
}

export function initBgm(): void {
  const audio = document.querySelector<HTMLAudioElement>('audio.bgm-audio');
  const btn = document.querySelector<HTMLElement>('.bgm-toggle');
  if (!audio || !btn) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    btn.hidden = true;
    if (!audio.paused) audio.pause();
    return;
  }
  btn.hidden = false;
  audio.volume = clampVolume(audio.dataset.volume);

  const sync = () => {
    const playing = !audio.paused;
    btn.classList.toggle('playing', playing);
    btn.setAttribute('aria-pressed', playing ? 'true' : 'false');
  };

  if (!audio.dataset.bgmBound) {
    audio.dataset.bgmBound = '1';
    audio.addEventListener('play', sync);
    audio.addEventListener('pause', sync);
  }

  if (!btn.dataset.bgmInit) {
    btn.dataset.bgmInit = '1';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (audio.paused) {
        writeSaved('1');
        playAudio(audio);
      } else {
        writeSaved('0');
        audio.pause();
      }
      sync();
    });
  }
  sync();

  // autoplay：先在首屏机会性开播；若浏览器策略拦截，则等首次用户交互后兜底。
  // kickArmed 模块级，不会因站内内容交换重复挂监听。
  const autoplayEnabled = audio.dataset.autoplay === 'true';
  if ((autoplayEnabled || readSaved() === '1') && audio.paused) {
    if (!kickArmed) {
      kickArmed = true;
      const kick = () => {
        if (audio.paused) playAudio(audio);
        sync();
      };
      document.addEventListener('click', kick, { once: true });
      document.addEventListener('keydown', kick, { once: true });
    }
    playAudio(audio, false);
  }
}
