/**
 * 背景音乐（site.yaml bgm 段，docs/specs/01 §1）：
 * - <audio class="bgm-audio"> 由 BaseLayout 渲染并 transition:persist，站内转场不中断；
 * - 播放/暂停按钮（.bgm-toggle）每页重建，astro:page-load 时重新绑定并按 audio 实际状态同步图标；
 * - 自动播放策略：localStorage 记住上次状态；上次为播放态时，等首次用户交互
 *   （click/keydown）后才开播；用户点过播放按钮（本身是手势）则立即播；
 * - prefers-reduced-motion: 整功能不启用（按钮隐藏、已在播则暂停）。
 */

const STORAGE_KEY = 'bgm';

function readSaved(): '1' | '0' | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === '1' || v === '0' ? v : null;
  } catch {
    return null; // 隐私模式等存储不可用场景：视为无记忆
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

  // reduced-motion：功能不启用（按钮隐藏，已在播则暂停）
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

  // audio 元素跨转场常驻（transition:persist），播放态监听只绑一次
  if (!audio.dataset.bgmBound) {
    audio.dataset.bgmBound = '1';
    audio.addEventListener('play', sync);
    audio.addEventListener('pause', sync);
  }
  // 按钮每页重建，需重新绑定（dataset 标记防同页 page-load 重复绑定）
  if (!btn.dataset.bgmInit) {
    btn.dataset.bgmInit = '1';
    btn.addEventListener('click', () => {
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

  // 自动恢复：上次为播放态且当前暂停 → 首次用户交互后开播（只挂一次）
  if (readSaved() === '1' && audio.paused && !document.documentElement.dataset.bgmAutoArmed) {
    document.documentElement.dataset.bgmAutoArmed = '1';
    const kick = () => {
      void audio.play().catch(() => {});
      sync();
    };
    document.addEventListener('click', kick, { once: true });
    document.addEventListener('keydown', kick, { once: true });
  }
}
