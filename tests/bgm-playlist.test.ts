import { describe, it, expect } from "vitest";
import { resolveBgmPlaylist, type BgmTrack, BGM_DEFAULT_VOLUME } from "../src/lib/bgm-playlist.ts";
import type { SiteConfig } from "../src/lib/config.ts";

describe("resolveBgmPlaylist", () => {
  it("converts single file legacy config to a 1-track playlist", () => {
    const site: SiteConfig = {
      site: { title: "Title" },
      profile: { name: "Name" },
      github: { username: "user" },
      bgm: {
        file: "assets/bgm.mp3",
        volume: 0.5,
        autoplay: true,
      },
    };
    const resolved = resolveBgmPlaylist(site);
    expect(resolved).not.toBeNull();
    expect(resolved!.tracks).toHaveLength(1);
    expect(resolved!.tracks[0]).toEqual({
      title: "bgm",
      artist: "",
      src: "assets/bgm.mp3",
      cover: undefined,
    });
    expect(resolved!.volume).toBe(0.5);
    expect(resolved!.autoplay).toBe(true);
    expect(resolved!.resume).toBe("state");
    expect(resolved!.showPanel).toBe(false);
  });

  it("normalizes multi-track playlist with metadata and custom titles", () => {
    const site = {
      site: { title: "Title" },
      profile: { name: "Name" },
      github: { username: "user" },
      bgm: {
        enabled: true,
        volume: 0.35,
        resume: "none" as const,
        show_panel: true,
        tracks: [
          { title: "Aria", artist: "J.S. Bach", src: "assets/audio/aria.mp3", cover: "assets/audio/aria.jpg" },
          { src: "assets/audio/goldberg.mp3" },
        ],
      },
    };
    const resolved = resolveBgmPlaylist(site as unknown as SiteConfig);
    expect(resolved).not.toBeNull();
    expect(resolved!.tracks).toHaveLength(2);
    expect(resolved!.tracks[0].title).toBe("Aria");
    expect(resolved!.tracks[0].artist).toBe("J.S. Bach");
    expect(resolved!.tracks[1].title).toBe("goldberg");
    expect(resolved!.resume).toBe("none");
    expect(resolved!.showPanel).toBe(true);
  });

  it("returns null when disabled or when no valid tracks exist", () => {
    expect(resolveBgmPlaylist({ site: { title: "T" }, profile: { name: "N" }, github: { username: "U" }, bgm: { enabled: false, file: "a.mp3" } })).toBeNull();
    expect(resolveBgmPlaylist({ site: { title: "T" }, profile: { name: "N" }, github: { username: "U" }, bgm: { enabled: true, tracks: [] } })).toBeNull();
  });
});
