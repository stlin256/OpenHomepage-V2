/**
 * 自渲染音频播放器（:::audio）：保留原生 <audio> 内核、隐藏 UI 交给本地 JS。
 * 主题变量继承 global.css；播放前置 metadata 预载时长，点击才拉流。
 * 独占播放策略：页面同时只允许一个媒体播放（音频 / 视频 / BGM 互斥），
 * BGM 在其他媒体播放时暂停，其他媒体播放结束后若 BGM 原本是自动播放状态则渐显续播。
 */
const BGM_SELECTOR = 'audio.bgm-audio';
const ACTIVE_ROOT_CLASS = 'is-playing';

let bgmWasPlaying = false;
let bgmVolume = 0.4;
let fadeTimer: number | null = null;
let marqueeBound = false;

function fadeBgm(audio: HTMLAudioElement, target: number): void {
  if (fadeTimer !== null) window.clearInterval(fadeTimer);
  const step = audio.volume > target ? -0.05 : 0.05;
  fadeTimer = window.setInterval(() => {
    const next = audio.volume + step;
    if ((step < 0 && next <= target) || (step > 0 && next >= target)) {
      audio.volume = target;
      if (target === 0) audio.pause();
      if (fadeTimer !== null) window.clearInterval(fadeTimer);
      fadeTimer = null;
      return;
    }
    audio.volume = next;
  }, 40);
}

export function pauseOtherMedia(current: HTMLMediaElement): void {
  const bgm = document.querySelector(BGM_SELECTOR);
  if (bgm instanceof HTMLAudioElement && !bgm.paused) {
    bgmWasPlaying = true;
    bgmVolume = bgm.volume;
    fadeBgm(bgm, 0);
  }

  for (const media of document.querySelectorAll<HTMLMediaElement>('audio, video')) {
    if (media === current || media === bgm || media.paused) continue;
    media.pause();
    const root = media.closest('.audio-player');
    if (root) root.classList.remove(ACTIVE_ROOT_CLASS);
  }
}

export function resumeBgmIfNeeded(): void {
  const bgm = document.querySelector(BGM_SELECTOR);
  if (!(bgm instanceof HTMLAudioElement) || !bgmWasPlaying) return;

  // 如果页面上还有其他音频或视频正在播放，暂不恢复
  const isOtherPlaying = Array.from(document.querySelectorAll<HTMLMediaElement>('audio, video')).some(
    (m) => m !== bgm && !m.paused && !m.ended
  );
  if (isOtherPlaying) return;

  bgmWasPlaying = false;
  bgm.volume = 0;
  bgm.play().then(() => fadeBgm(bgm, bgmVolume)).catch(() => {});
}

export function setupAudioMarquee(root?: ParentNode): void {
  const scope = root ?? document;
  for (const el of scope.querySelectorAll<HTMLElement>('[data-marquee]')) {
    const holder = el.closest<HTMLElement>('.audio-scroll');
    if (!holder) continue;
    const overflow = el.scrollWidth - holder.clientWidth;
    if (overflow > 4) {
      holder.style.setProperty('--shift', `${overflow + 12}px`);
      holder.classList.add('scrolling');
    } else {
      holder.classList.remove('scrolling');
      holder.style.removeProperty('--shift');
    }
  }
}

function initAudioPlayer(root: HTMLElement): void {
  if (root.dataset.audioInit) return;
  root.dataset.audioInit = '1';
  const src = root.dataset.src;
  if (!src) return;

  const audio = document.createElement('audio');
  audio.className = 'audio-native';
  const allowed = ['auto', 'metadata', 'none'] as const;
  const wanted = root.dataset.preload ?? 'metadata';
  audio.preload = allowed.find((p) => p === wanted) ?? 'metadata';
  audio.src = src;
  root.appendChild(audio);

  const fill = root.querySelector<HTMLElement>('.audio-fill');
  const time = root.querySelector<HTMLElement>('.audio-time');
  const btn = root.querySelector<HTMLElement>('.btn-toggle');
  const track = root.querySelector<HTMLElement>('.audio-track');

  const fmt = (s: number): string => {
    if (!isFinite(s)) return '--:--';
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${String(ss).padStart(2, '0')}`;
  };

  btn?.addEventListener('click', async () => {
    if (audio.paused) {
      pauseOtherMedia(audio);
      try {
        if (audio.networkState === HTMLMediaElement.NETWORK_EMPTY) audio.load();
        await audio.play();
      } catch {}
    } else {
      audio.pause();
      resumeBgmIfNeeded();
    }
  });

  track?.addEventListener('click', (e: MouseEvent) => {
    if (!audio.duration) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    audio.currentTime = ratio * audio.duration;
  });

  audio.addEventListener('play', () => root.classList.add(ACTIVE_ROOT_CLASS));
  audio.addEventListener('pause', () => {
    root.classList.remove(ACTIVE_ROOT_CLASS);
    resumeBgmIfNeeded();
  });
  audio.addEventListener('ended', () => {
    root.classList.remove(ACTIVE_ROOT_CLASS);
    resumeBgmIfNeeded();
  });
  audio.addEventListener('error', () => {
    root.classList.remove(ACTIVE_ROOT_CLASS);
    resumeBgmIfNeeded();
  });
  audio.addEventListener('loadedmetadata', () => {
    if (time) time.textContent = `0:00 / ${fmt(audio.duration)}`;
  });
  audio.addEventListener('timeupdate', () => {
    if (fill && audio.duration) fill.style.transform = `scaleX(${audio.currentTime / audio.duration})`;
    if (time) time.textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;
  });
}

export function initAudioPlayers(): void {
  const bgm = document.querySelector<HTMLMediaElement>(BGM_SELECTOR);
  bgmVolume = Number(bgm?.dataset?.volume ?? '0.4') || 0.4;
  for (const root of document.querySelectorAll<HTMLElement>(
    document.documentElement.classList.contains('oh-edit')
      ? '.markdown-body .audio-player:not([data-audio-init])'
      : '.audio-player',
  )) {
    if (document.documentElement.classList.contains('oh-edit')) {
      // 编辑模式：不初始化播放，仍保留 DOM 供 overlay 检查器编辑
      root.dataset.audioInit = '1';
      continue;
    }
    initAudioPlayer(root);
  }

  setupAudioMarquee();
  if (!marqueeBound) {
    marqueeBound = true;
    window.addEventListener('resize', () => setupAudioMarquee(), { passive: true });
  }
}