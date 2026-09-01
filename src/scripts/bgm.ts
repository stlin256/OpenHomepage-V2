/**
 * 背景音乐与播放列表控制（P1 升级）：
 * - <audio class="bgm-audio"> 在 BaseLayout 渲染，客户端内容交换不触碰它；
 * - 播放/暂停按钮在 header 内；
 * - 支持多曲目播放列表、切歌、音量调节抽屉、MediaSession API 与连续播放。
 */

interface Track {
  title: string;
  artist?: string;
  src: string;
  cover?: string;
}

const STORAGE_KEY = 'bgm';
const STORAGE_VOLUME_KEY = 'oh-bgm-volume';
const STORAGE_TRACK_KEY = 'oh-bgm-track';

let kickArmed = false;
let currentTrackIndex = 0;
let tracks: Track[] = [];

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

function readSavedTrackIndex(): number {
  try {
    const idx = Number(localStorage.getItem(STORAGE_TRACK_KEY));
    return Number.isInteger(idx) && idx >= 0 ? idx : 0;
  } catch {
    return 0;
  }
}

function writeSavedTrackIndex(idx: number): void {
  try {
    localStorage.setItem(STORAGE_TRACK_KEY, String(idx));
  } catch {
    /* ignore */
  }
}

function clampVolume(raw: number | string | undefined): number {
  const v = Number(raw);
  if (!Number.isFinite(v)) return 0.4;
  return Math.min(1, Math.max(0, v));
}

function playAudio(audio: HTMLAudioElement, loadFirst = true): void {
  if (loadFirst && audio.networkState === HTMLMediaElement.NETWORK_EMPTY) audio.load();
  void audio.play().catch(() => {});
}

function updateMediaSession(track: Track, audio: HTMLAudioElement, onPrev?: () => void, onNext?: () => void): void {
  if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist || '',
      artwork: track.cover ? [{ src: track.cover }] : [],
    });
    navigator.mediaSession.setActionHandler('play', () => playAudio(audio));
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    if (onPrev) navigator.mediaSession.setActionHandler('previoustrack', onPrev);
    if (onNext) navigator.mediaSession.setActionHandler('nexttrack', onNext);
  } catch {
    /* MediaSession optional */
  }
}

function isMobile(): boolean {
  return window.matchMedia('(max-width: 768px)').matches;
}

function setDrawerOpen(drawer: HTMLElement, open: boolean): void {
  drawer.classList.toggle('open', open);
  const toggle = document.querySelector('.bgm-toggle');
  toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
}

export function initBgm(): void {
  const audio = document.querySelector<HTMLAudioElement>('audio.bgm-audio');
  const btn = document.querySelector<HTMLElement>('.bgm-toggle');
  const drawer = document.querySelector<HTMLElement>('.bgm-drawer');
  if (!audio || !btn) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    btn.hidden = true;
    if (drawer) drawer.hidden = true;
    if (!audio.paused) audio.pause();
    return;
  }
  btn.hidden = false;

  // Parse playlist tracks
  try {
    const rawTracks = JSON.parse(audio.dataset.tracks ?? '[]');
    tracks = Array.isArray(rawTracks) && rawTracks.length > 0 ? rawTracks : [{ title: 'BGM', artist: '', src: audio.src }];
  } catch {
    tracks = [{ title: 'BGM', artist: '', src: audio.src }];
  }

  // Load saved volume
  let initialVolume = clampVolume(audio.dataset.volume);
  try {
    const savedVol = localStorage.getItem(STORAGE_VOLUME_KEY);
    if (savedVol !== null) initialVolume = clampVolume(savedVol);
  } catch {
    /* ignore */
  }
  audio.volume = initialVolume;

  // Load saved track
  if (audio.dataset.resume !== 'none') {
    currentTrackIndex = Math.min(tracks.length - 1, readSavedTrackIndex());
  }

  const syncDrawer = () => {
    if (!drawer) return;
    const current = tracks[currentTrackIndex] || tracks[0];
    const titleEl = drawer.querySelector('.bgm-current-title');
    const artistEl = drawer.querySelector('.bgm-current-artist');
    const coverEl = drawer.querySelector<HTMLImageElement>('.bgm-current-cover');
    const slider = drawer.querySelector<HTMLInputElement>('.bgm-volume-slider');
    const playIcon = drawer.querySelector<HTMLElement>('.bgm-play-btn .icon-play');
    const pauseIcon = drawer.querySelector<HTMLElement>('.bgm-play-btn .icon-pause');

    if (titleEl) titleEl.textContent = current.title;
    if (artistEl) artistEl.textContent = current.artist || audio.dataset.artistFallback || '';
    if (coverEl) {
      if (current.cover) {
        coverEl.src = current.cover;
      } else if (!coverEl.classList.contains('bgm-cover-placeholder')) {
        coverEl.src = '';
      }
    }
    if (slider) slider.value = String(audio.volume);
    if (playIcon && pauseIcon) {
      playIcon.style.display = audio.paused ? '' : 'none';
      pauseIcon.style.display = audio.paused ? 'none' : '';
    }

    const items = drawer.querySelectorAll('.bgm-track-item');
    items.forEach((item, idx) => {
      const active = idx === currentTrackIndex;
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'true');
      else item.removeAttribute('aria-current');
    });
  };

  const sync = () => {
    const playing = !audio.paused;
    btn.classList.toggle('playing', playing);
    btn.setAttribute('aria-pressed', playing ? 'true' : 'false');
    syncDrawer();
  };

  const switchTrack = (index: number, shouldPlay = true) => {
    if (index < 0) index = tracks.length - 1;
    if (index >= tracks.length) index = 0;
    currentTrackIndex = index;
    writeSavedTrackIndex(index);
    const track = tracks[currentTrackIndex];
    if (track) {
      audio.src = track.src;
      updateMediaSession(track, audio, () => switchTrack(currentTrackIndex - 1), () => switchTrack(currentTrackIndex + 1));
      if (shouldPlay) {
        writeSaved('1');
        playAudio(audio);
      }
    }
    sync();
  };

  // Audio events
  if (!audio.dataset.bgmBound) {
    audio.dataset.bgmBound = '1';
    audio.addEventListener('play', sync);
    audio.addEventListener('pause', sync);
    audio.addEventListener('ended', () => {
      if (tracks.length > 1) {
        switchTrack(currentTrackIndex + 1, true);
      }
    });
    audio.addEventListener('error', () => {
      // On load error, skip to next track once
      if (tracks.length > 1) {
        switchTrack(currentTrackIndex + 1, !audio.paused);
      }
    });
  }

  // Header Toggle Button
  if (!btn.dataset.bgmInit) {
    btn.dataset.bgmInit = '1';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // 移动端：点按切换播放列表抽屉（底部抽屉 + 遮罩，同搜索）；
      // 桌面端：点按播放/暂停，悬浮显隐卡片由 CSS hover 负责（同语言菜单）。
      if (drawer && isMobile()) {
        setDrawerOpen(drawer, !drawer.classList.contains('open'));
        syncDrawer();
      } else {
        if (audio.paused) {
          writeSaved('1');
          playAudio(audio);
        } else {
          writeSaved('0');
          audio.pause();
        }
        sync();
      }
    });
  }

  // Drawer Controls
  if (drawer && !drawer.dataset.drawerInit) {
    drawer.dataset.drawerInit = '1';

    // 移动端遮罩：点击关闭抽屉（同搜索遮罩）
    document.querySelector('.bgm-backdrop')?.addEventListener('click', () => {
      setDrawerOpen(drawer, false);
    });

    // Esc 关闭抽屉
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) {
        setDrawerOpen(drawer, false);
      }
    });

    drawer.querySelector('.bgm-play-btn')?.addEventListener('click', () => {
      if (audio.paused) {
        writeSaved('1');
        playAudio(audio);
      } else {
        writeSaved('0');
        audio.pause();
      }
      sync();
    });

    drawer.querySelector('.bgm-prev-btn')?.addEventListener('click', () => {
      switchTrack(currentTrackIndex - 1, true);
    });

    drawer.querySelector('.bgm-next-btn')?.addEventListener('click', () => {
      switchTrack(currentTrackIndex + 1, true);
    });

    const volumeSlider = drawer.querySelector<HTMLInputElement>('.bgm-volume-slider');
    if (volumeSlider) {
      volumeSlider.addEventListener('input', () => {
        const val = clampVolume(volumeSlider.value);
        audio.volume = val;
        try {
          localStorage.setItem(STORAGE_VOLUME_KEY, String(val));
        } catch {
          /* ignore */
        }
      });
    }

    drawer.querySelectorAll<HTMLElement>('.bgm-track-item').forEach((item) => {
      item.addEventListener('click', () => {
        const idx = Number(item.dataset.trackIndex);
        if (Number.isInteger(idx)) {
          switchTrack(idx, true);
        }
      });
    });
  }

  sync();

  // Set initial media session metadata
  const currentTrack = tracks[currentTrackIndex] || tracks[0];
  if (currentTrack) {
    updateMediaSession(currentTrack, audio, () => switchTrack(currentTrackIndex - 1), () => switchTrack(currentTrackIndex + 1));
  }

  // Autoplay / Resume logic
  const autoplayEnabled = audio.dataset.autoplay === 'true';
  const saved = readSaved();
  // 用户明确暂停（saved === '0'）时尊重用户意图，切页或切 tab 绝不再自动播放；
  // 仅在用户主动播放过（saved === '1'）或未交互且配置自动播放（saved === null && autoplayEnabled）时恢复
  const shouldAutoplay = saved === '1' || (saved === null && autoplayEnabled);
  if (shouldAutoplay && audio.paused) {
    if (!kickArmed) {
      kickArmed = true;
      const disarmKick = () => {
        document.removeEventListener('click', kick);
        document.removeEventListener('keydown', kick);
      };
      const kick = (event: Event) => {
        // BGM 控件自身的点击/键盘操作有明确意图（暂停、切歌、关闭抽屉等），
        // 不能冒泡到这里的“首次任意交互自动恢复播放”逻辑；否则暂停按钮
        // 第一次点击时会被这里重新 play，表现为“点两次才暂停”。
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('.bgm-switcher')) return;
        if (readSaved() === '0') {
          disarmKick();
          return;
        }
        if (audio.paused) playAudio(audio);
        sync();
        disarmKick();
      };
      document.addEventListener('click', kick);
      document.addEventListener('keydown', kick);
    }
    playAudio(audio, false);
  }
}
