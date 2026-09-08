/**
 * 自渲染视频播放器（:::video）：保留原生 <video> 内核、隐藏浏览器原生 controls。
 * 遵循杂志卡片整合式（Scheme B）设计规范；
 * 采用 GPU 复合属性（scaleX / opacity / translate3d）驱动动效，避免高频滚动卡顿；
 * 独占播放策略：页面同时只允许一个媒体播放（与 audio / BGM 互斥），
 * 播放时自动暂停全局 BGM，暂停或结束时自动唤醒续播 BGM。
 */

import { pauseOtherMedia, resumeBgmIfNeeded } from './audio-player.ts';

const ACTIVE_ROOT_CLASS = 'is-playing';
const BUFFERING_CLASS = 'is-buffering';
const IDLE_CLASS = 'is-idle';

export function formatTime(sec: number): string {
  if (!isFinite(sec) || isNaN(sec) || sec < 0) return '00:00';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const remSec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;
}

export function initVideoPlayer(root: HTMLElement): void {
  if (root.dataset.videoInit) return;
  root.dataset.videoInit = '1';

  const video =
    root.querySelector<HTMLVideoElement>('video.video-element') ||
    root.querySelector<HTMLVideoElement>('video');
  if (!video) return;

  const bigPlay = root.querySelector<HTMLElement>('.video-big-play');
  const btnPlay = root.querySelector<HTMLElement>('.btn-play-pause');
  const iconPlay = root.querySelector<HTMLElement>('.icon-play');
  const iconPause = root.querySelector<HTMLElement>('.icon-pause');
  const iconReplay = root.querySelector<HTMLElement>('.icon-replay');

  const progressWrap = root.querySelector<HTMLElement>('.video-progress-wrap');
  const progressBuffer = root.querySelector<HTMLElement>('.video-progress-buffer');
  const progressPlayed = root.querySelector<HTMLElement>('.video-progress-played');
  const progressTooltip = root.querySelector<HTMLElement>('.video-progress-tooltip');

  const timeCur = root.querySelector<HTMLElement>('.video-time-cur');
  const timeDur = root.querySelector<HTMLElement>('.video-time-dur');

  const btnVol = root.querySelector<HTMLElement>('.btn-volume');
  const iconVolHigh = root.querySelector<HTMLElement>('.icon-vol-high');
  const iconVolLow = root.querySelector<HTMLElement>('.icon-vol-low');
  const iconVolMute = root.querySelector<HTMLElement>('.icon-vol-mute');
  const volRail = root.querySelector<HTMLElement>('.video-volume-rail');
  const volFill = root.querySelector<HTMLElement>('.video-volume-fill');

  const btnSpeed = root.querySelector<HTMLElement>('.btn-speed');
  const speedMenu = root.querySelector<HTMLElement>('.video-speed-menu');

  const btnPip = root.querySelector<HTMLElement>('.btn-pip');
  const btnFs = root.querySelector<HTMLElement>('.btn-fullscreen');
  const iconFsEnter = root.querySelector<HTMLElement>('.icon-fs-enter');
  const iconFsExit = root.querySelector<HTMLElement>('.icon-fs-exit');

  let isDraggingProgress = false;
  let lastVolume = video.volume > 0 ? video.volume : 1;
  let idleTimer: number | null = null;
  let moveThrottle = false;

  const resetIdleTimer = () => {
    root.classList.remove(IDLE_CLASS);
    if (idleTimer !== null) {
      window.clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (!video.paused && !video.ended) {
      idleTimer = window.setTimeout(() => {
        root.classList.add(IDLE_CLASS);
      }, 2500);
    }
  };

  const onPointerMove = () => {
    if (moveThrottle) return;
    moveThrottle = true;
    resetIdleTimer();
    window.requestAnimationFrame(() => {
      moveThrottle = false;
    });
  };

  root.addEventListener('mousemove', onPointerMove, { passive: true });
  root.addEventListener('touchstart', onPointerMove, { passive: true });

  const togglePlay = async () => {
    if (video.paused || video.ended) {
      pauseOtherMedia(video);
      try {
        if (video.networkState === HTMLMediaElement.NETWORK_EMPTY) video.load();
        await video.play();
      } catch {
        /* 浏览器自动播放策略限制静默降级 */
      }
    } else {
      video.pause();
      resumeBgmIfNeeded();
    }
  };

  bigPlay?.addEventListener('click', (e) => {
    e.stopPropagation();
    void togglePlay();
  });
  btnPlay?.addEventListener('click', (e) => {
    e.stopPropagation();
    void togglePlay();
  });

  // 单击视频区域切换播放/暂停
  video.addEventListener('click', () => {
    void togglePlay();
  });

  video.addEventListener('play', () => {
    root.classList.add(ACTIVE_ROOT_CLASS);
    if (iconPlay) iconPlay.style.display = 'none';
    if (iconPause) iconPause.style.display = 'block';
    if (iconReplay) iconReplay.style.display = 'none';
    pauseOtherMedia(video);
    resetIdleTimer();
  });

  video.addEventListener('pause', () => {
    root.classList.remove(ACTIVE_ROOT_CLASS, IDLE_CLASS);
    if (iconPlay) iconPlay.style.display = 'block';
    if (iconPause) iconPause.style.display = 'none';
    if (iconReplay) iconReplay.style.display = 'none';
    if (idleTimer !== null) {
      window.clearTimeout(idleTimer);
      idleTimer = null;
    }
    resumeBgmIfNeeded();
  });

  video.addEventListener('ended', () => {
    root.classList.remove(ACTIVE_ROOT_CLASS, IDLE_CLASS);
    if (iconPlay) iconPlay.style.display = 'none';
    if (iconPause) iconPause.style.display = 'none';
    if (iconReplay) iconReplay.style.display = 'block';
    if (idleTimer !== null) {
      window.clearTimeout(idleTimer);
      idleTimer = null;
    }
    resumeBgmIfNeeded();
  });

  video.addEventListener('waiting', () => {
    root.classList.add(BUFFERING_CLASS);
  });
  video.addEventListener('playing', () => {
    root.classList.remove(BUFFERING_CLASS);
    root.classList.add(ACTIVE_ROOT_CLASS);
  });

  // 进度与时间更新（scaleX 复合属性驱动，无 layout 回流）
  const updateDuration = () => {
    if (timeDur && isFinite(video.duration) && video.duration > 0) {
      timeDur.textContent = formatTime(video.duration);
    }
    if (timeCur) timeCur.textContent = formatTime(video.currentTime);
  };
  video.addEventListener('loadedmetadata', updateDuration);
  video.addEventListener('durationchange', updateDuration);

  video.addEventListener('timeupdate', () => {
    if (isDraggingProgress) return;
    if (video.duration && isFinite(video.duration)) {
      const ratio = Math.max(0, Math.min(1, video.currentTime / video.duration));
      if (progressPlayed) progressPlayed.style.transform = `scaleX(${ratio})`;
    }
    if (timeCur) timeCur.textContent = formatTime(video.currentTime);
  });

  video.addEventListener('progress', () => {
    if (progressBuffer && video.buffered.length > 0 && video.duration) {
      const bufEnd = video.buffered.end(video.buffered.length - 1);
      const ratio = Math.max(0, Math.min(1, bufEnd / video.duration));
      progressBuffer.style.transform = `scaleX(${ratio})`;
    }
  });

  // 进度条拖拽与悬浮
  const seekTo = (clientX: number): number | undefined => {
    if (!progressWrap || !video.duration || !isFinite(video.duration)) return;
    const rect = progressWrap.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    if (progressPlayed) progressPlayed.style.transform = `scaleX(${ratio})`;
    if (timeCur) timeCur.textContent = formatTime(ratio * video.duration);
    return ratio;
  };

  progressWrap?.addEventListener('mousemove', (e: MouseEvent) => {
    if (!progressWrap || !progressTooltip || !video.duration || !isFinite(video.duration)) return;
    const rect = progressWrap.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const ratio = x / Math.max(1, rect.width);
    progressTooltip.textContent = formatTime(ratio * video.duration);
    progressTooltip.style.left = `${x}px`;
  });

  progressWrap?.addEventListener('mousedown', (e: MouseEvent) => {
    isDraggingProgress = true;
    progressWrap.classList.add('is-dragging');
    seekTo(e.clientX);
    const onMove = (ev: MouseEvent) => {
      seekTo(ev.clientX);
    };
    const onUp = (ev: MouseEvent) => {
      isDraggingProgress = false;
      progressWrap.classList.remove('is-dragging');
      const finalRatio = seekTo(ev.clientX);
      if (typeof finalRatio === 'number' && video.duration) {
        video.currentTime = finalRatio * video.duration;
      }
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  progressWrap?.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      if (!e.touches[0]) return;
      isDraggingProgress = true;
      progressWrap.classList.add('is-dragging');
      seekTo(e.touches[0].clientX);
    },
    { passive: true },
  );

  progressWrap?.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      if (!isDraggingProgress || !e.touches[0]) return;
      seekTo(e.touches[0].clientX);
    },
    { passive: true },
  );

  progressWrap?.addEventListener('touchend', (e: TouchEvent) => {
    if (!isDraggingProgress || !progressWrap) return;
    isDraggingProgress = false;
    progressWrap.classList.remove('is-dragging');
    const touch = e.changedTouches[0];
    if (touch && video.duration) {
      const rect = progressWrap.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (touch.clientX - rect.left) / Math.max(1, rect.width)));
      video.currentTime = ratio * video.duration;
    }
  });

  // 音量控制
  const updateVolumeUI = () => {
    const isMuted = video.muted || video.volume === 0;
    const vol = isMuted ? 0 : video.volume;
    if (volFill) volFill.style.transform = `scaleX(${vol})`;

    if (iconVolMute) iconVolMute.style.display = isMuted ? 'block' : 'none';
    if (iconVolLow) iconVolLow.style.display = !isMuted && vol < 0.5 ? 'block' : 'none';
    if (iconVolHigh) iconVolHigh.style.display = !isMuted && vol >= 0.5 ? 'block' : 'none';
  };

  btnVol?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (video.muted) {
      video.muted = false;
      video.volume = lastVolume > 0 ? lastVolume : 1;
    } else {
      lastVolume = video.volume > 0 ? video.volume : 1;
      video.muted = true;
    }
    updateVolumeUI();
    resetIdleTimer();
  });

  volRail?.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    const rect = volRail.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    video.muted = false;
    video.volume = ratio;
    lastVolume = ratio;
    updateVolumeUI();
    resetIdleTimer();
  });

  // 倍速控制
  btnSpeed?.addEventListener('click', (e) => {
    e.stopPropagation();
    speedMenu?.classList.toggle('show');
    resetIdleTimer();
  });

  speedMenu?.querySelectorAll<HTMLElement>('.speed-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const spd = parseFloat(item.dataset.speed || '1.0');
      if (isFinite(spd) && spd > 0) {
        video.playbackRate = spd;
        if (btnSpeed) btnSpeed.textContent = spd === 1 ? '1.0x' : `${spd}x`;
        speedMenu.querySelectorAll('.speed-item').forEach((it) => it.classList.remove('active'));
        item.classList.add('active');
      }
      speedMenu.classList.remove('show');
      resetIdleTimer();
    });
  });

  document.addEventListener('click', () => {
    speedMenu?.classList.remove('show');
  });

  // 画中画
  btnPip?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    } else if (video.requestPictureInPicture) {
      video.requestPictureInPicture().catch(() => {});
    }
    resetIdleTimer();
  });

  // 全屏切换
  const toggleFullscreen = () => {
    const v = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    if (!document.fullscreenElement) {
      if (root.requestFullscreen) {
        root.requestFullscreen().catch(() => {});
      } else if (v.webkitEnterFullscreen) {
        v.webkitEnterFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
    resetIdleTimer();
  };

  btnFs?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFullscreen();
  });

  document.addEventListener('fullscreenchange', () => {
    const isFs = document.fullscreenElement === root;
    if (iconFsEnter) iconFsEnter.style.display = isFs ? 'none' : 'block';
    if (iconFsExit) iconFsExit.style.display = isFs ? 'block' : 'none';
  });

  // 键盘无障碍快捷键（焦点在播放器容器内生效）
  root.addEventListener('keydown', (e: KeyboardEvent) => {
    if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

    switch (e.key.toLowerCase()) {
      case ' ':
      case 'k':
        e.preventDefault();
        void togglePlay();
        resetIdleTimer();
        break;
      case 'arrowleft':
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - (e.shiftKey ? 10 : 5));
        resetIdleTimer();
        break;
      case 'arrowright':
        e.preventDefault();
        video.currentTime = Math.min(video.duration || 0, video.currentTime + (e.shiftKey ? 10 : 5));
        resetIdleTimer();
        break;
      case 'arrowup':
        e.preventDefault();
        video.muted = false;
        video.volume = Math.min(1, video.volume + 0.1);
        lastVolume = video.volume;
        updateVolumeUI();
        resetIdleTimer();
        break;
      case 'arrowdown':
        e.preventDefault();
        video.volume = Math.max(0, video.volume - 0.1);
        lastVolume = video.volume;
        updateVolumeUI();
        resetIdleTimer();
        break;
      case 'm':
        e.preventDefault();
        video.muted = !video.muted;
        updateVolumeUI();
        resetIdleTimer();
        break;
      case 'f':
        e.preventDefault();
        toggleFullscreen();
        break;
      default:
        if (e.key >= '0' && e.key <= '9' && video.duration) {
          e.preventDefault();
          video.currentTime = (parseInt(e.key, 10) / 10) * video.duration;
          resetIdleTimer();
        }
        break;
    }
  });

  updateVolumeUI();
}

export function initVideoPlayers(): void {
  for (const root of document.querySelectorAll<HTMLElement>(
    document.documentElement.classList.contains('oh-edit')
      ? '.markdown-body .video-player:not([data-video-init])'
      : '.video-player',
  )) {
    if (document.documentElement.classList.contains('oh-edit')) {
      root.dataset.videoInit = '1';
      continue;
    }
    initVideoPlayer(root);
  }

  // 兜底处理未用 .video-player 包装的原生 <video>，保持独占互斥
  for (const media of document.querySelectorAll<HTMLMediaElement>(
    '.markdown-body video:not(.video-element)',
  )) {
    if (media.dataset.mediaLoaded === '1') continue;
    media.dataset.mediaLoaded = '1';
    ['play', 'playing', 'pause', 'ended'].forEach((evt) => {
      media.addEventListener(evt, () => {
        if (evt === 'play' || evt === 'playing') pauseOtherMedia(media);
        else resumeBgmIfNeeded();
      });
    });
  }
}
