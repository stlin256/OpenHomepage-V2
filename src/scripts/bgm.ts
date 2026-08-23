/**
 * 背景音乐（site.yaml bgm 段）：
 * - <audio class="bgm-audio"> 由 BaseLayout 渲染并 transition:persist，站内转场不中断；
 * - 播放/暂停按钮（.bgm-toggle）随 header persist 或每页重建，page-load 时同步图标；
 * - autoplay 或 localStorage 记忆播放态时，等首次用户交互后开播；
 * - swap 前保存播放位置，swap 后若被中断则恢复到原位置（无缝衔接）。
 *
 * 注意：模块级变量在 Astro ClientRouter 导航间持久（脚本只加载一次），
 * 不能用 document.documentElement.dataset 存状态（html 元素会被 swap 替换）。
 */

const STORAGE_KEY = 'bgm';

/** 模块级状态（跨 ClientRouter 导航持久） */
let kickArmed = false;
let wasPlaying = false;
let savedTime = 0;

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
      // 阻止 click 冒泡到 document 触发 kick（否则暂停后立即被 kick 恢复播放）
      e.stopPropagation();
      if (audio.paused) {
        writeSaved('1');
        void audio.play().catch(() => {});
      } else {
        writeSaved('0');
        audio.pause();
      }
      sync();
    });
  }
  sync();

  // autoplay：首次用户交互后开播。kickArmed 是模块级变量，跨导航持久，
  // 不会因 html 元素被 swap 替换而丢失（修复每次导航重复挂 kick 的 bug）
  const autoplayEnabled = audio.dataset.autoplay === 'true';
  if ((autoplayEnabled || readSaved() === '1') && audio.paused && !kickArmed) {
    kickArmed = true;
    const kick = () => {
      void audio.play().catch(() => {});
      sync();
    };
    document.addEventListener('click', kick, { once: true });
    document.addEventListener('keydown', kick, { once: true });
  }
}

// ---- 跨页面转场：保存/恢复播放位置 ----
// module 级监听在 document 上，ClientRouter 不会移除（脚本只加载一次）

document.addEventListener('astro:before-swap', () => {
  const audio = document.querySelector<HTMLAudioElement>('audio.bgm-audio');
  if (!audio) return;
  wasPlaying = !audio.paused;
  savedTime = audio.currentTime;
});

document.addEventListener('astro:after-swap', () => {
  const audio = document.querySelector<HTMLAudioElement>('audio.bgm-audio');
  if (!audio || !wasPlaying) return;
  if (audio.paused) {
    // 等 loadedmetadata 后再设 currentTime（新 audio 未加载时赋值无效）
    const restore = () => {
      audio.currentTime = savedTime;
      void audio.play().catch(() => {});
      audio.removeEventListener('loadedmetadata', restore);
    };
    if (audio.readyState >= 1) {
      restore();
    } else {
      audio.addEventListener('loadedmetadata', restore, { once: true });
      audio.load();
    }
  }
});
