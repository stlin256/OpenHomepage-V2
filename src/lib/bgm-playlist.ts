/**
 * P1 背景音乐多曲目播放列表（BGM Playlist）配置归一化与视图模型解析。
 */
import type { SiteConfig } from './config.ts';

export const BGM_DEFAULT_VOLUME = 0.4;

export interface BgmTrack {
  title: string;
  artist?: string;
  src: string;
  cover?: string;
}

export interface ResolvedBgmPlaylist {
  tracks: BgmTrack[];
  volume: number;
  autoplay: boolean;
  resume: 'none' | 'state';
  showPanel: boolean;
}

function cleanTrackTitle(src: string): string {
  const filename = src.split(/[/\\]/).pop() ?? src;
  return filename.replace(/\.[a-zA-Z0-9]+$/, '');
}

export function resolveBgmPlaylist(site: SiteConfig): ResolvedBgmPlaylist | null {
  const bgm = site.bgm as any;
  if (!bgm || typeof bgm !== 'object' || bgm.enabled === false) return null;

  const rawTracks: any[] = Array.isArray(bgm.tracks) ? bgm.tracks : [];
  const tracks: BgmTrack[] = [];

  for (const t of rawTracks) {
    if (!t || typeof t !== 'object') continue;
    const src = typeof t.src === 'string' ? t.src.trim() : '';
    if (!src) continue;
    const title = typeof t.title === 'string' && t.title.trim() ? t.title.trim() : cleanTrackTitle(src);
    const artist = typeof t.artist === 'string' && t.artist.trim() ? t.artist.trim() : '';
    const cover = typeof t.cover === 'string' && t.cover.trim() ? t.cover.trim() : undefined;
    tracks.push({ title, artist, src, cover });
  }

  // Fallback to legacy single file if tracks array is empty
  if (tracks.length === 0 && typeof bgm.file === 'string' && bgm.file.trim()) {
    const src = bgm.file.trim();
    tracks.push({
      title: cleanTrackTitle(src),
      artist: '',
      src,
      cover: undefined,
    });
  }

  if (tracks.length === 0) return null;

  const v = bgm.volume;
  const volume =
    typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : BGM_DEFAULT_VOLUME;
  const autoplay = bgm.autoplay === true;
  const resume = bgm.resume === 'none' ? 'none' : 'state';
  const showPanel = typeof bgm.show_panel === 'boolean' ? bgm.show_panel : tracks.length > 1;

  return {
    tracks,
    volume,
    autoplay,
    resume,
    showPanel,
  };
}
