/**
 * src/lib/youtube.ts 单元测试：
 * 覆盖缓存读写（含损坏 JSON 降级）、oEmbed 请求构造、
 * 正常响应解析、缓存命中、并发去重与错误/超时降级分支。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  loadYouTubeCache,
  saveYouTubeCache,
  fetchYouTubeMeta,
  resetYouTubeState,
} from "../src/lib/youtube.ts";

/** 构造一个成功的 oEmbed 响应替身 */
function okResponse(json: unknown): Response {
  return {
    ok: true,
    json: async () => json,
  } as unknown as Response;
}

describe("src/lib/youtube.ts", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "oh-youtube-test-"));
    resetYouTubeState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("loadYouTubeCache / saveYouTubeCache", () => {
    it("缓存文件不存在时返回空对象", () => {
      expect(loadYouTubeCache(tempDir)).toEqual({});
    });

    it("能读取已存在的缓存文件", () => {
      const cached = {
        abc123: {
          id: "abc123",
          title: "已缓存视频",
          thumbnail_url: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
          fetched_at: 123456789,
        },
      };
      writeFileSync(path.join(tempDir, "youtube.json"), JSON.stringify(cached), "utf8");
      expect(loadYouTubeCache(tempDir)).toEqual(cached);
    });

    it("缓存文件损坏（非法 JSON）时降级为空对象而不是抛错", () => {
      writeFileSync(path.join(tempDir, "youtube.json"), "{not valid json", "utf8");
      expect(loadYouTubeCache(tempDir)).toEqual({});
    });

    it("保存时自动创建缺失目录并原子落盘，内容可被重新读取", () => {
      const nestedDir = path.join(tempDir, "nested", "cache");
      const map = {
        vid1: {
          id: "vid1",
          title: "落盘视频",
          thumbnail_url: "https://i.ytimg.com/vi/vid1/hqdefault.jpg",
          fetched_at: 111,
        },
      };
      saveYouTubeCache(map, nestedDir);

      const file = path.join(nestedDir, "youtube.json");
      expect(existsSync(file)).toBe(true);
      expect(existsSync(`${file}.tmp`)).toBe(false); // 临时文件已 rename，无残留
      expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(map);

      resetYouTubeState(); // 清掉内存缓存，强制从磁盘读
      expect(loadYouTubeCache(nestedDir)).toEqual(map);
    });
  });

  describe("fetchYouTubeMeta 参数与缓存分支", () => {
    it("空白 id 直接返回 null，不发起网络请求", async () => {
      const mockFetch = vi.fn();
      expect(await fetchYouTubeMeta("", { cacheDir: tempDir, fetchFn: mockFetch })).toBeNull();
      expect(await fetchYouTubeMeta("   ", { cacheDir: tempDir, fetchFn: mockFetch })).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("缓存命中时直接返回缓存条目，不发起网络请求", async () => {
      const cached = {
        id: "cachedId",
        title: "缓存命中",
        thumbnail_url: "https://i.ytimg.com/vi/cachedId/hqdefault.jpg",
        fetched_at: 42,
      };
      saveYouTubeCache({ cachedId: cached }, tempDir);

      const mockFetch = vi.fn();
      const meta = await fetchYouTubeMeta("cachedId", { cacheDir: tempDir, fetchFn: mockFetch });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(meta).toEqual(cached);
    });
  });

  describe("fetchYouTubeMeta 请求构造与正常响应", () => {
    it("构造正确的 oEmbed URL（watch URL 经双重编码）并附带 UA/Accept/超时 signal", async () => {
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;
      const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedInit = init;
        return okResponse({ title: "视频标题", thumbnail_url: "https://i.ytimg.com/vi/abc/hqdefault.jpg" });
      });

      const meta = await fetchYouTubeMeta("  abc  ", {
        cacheDir: tempDir,
        fetchFn: mockFetch as any,
        now: () => 999,
        timeoutMs: 1234,
      });

      // id 被 trim 后拼入 watch URL，再整体 encode 进 oembed url 参数
      const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent("abc")}`;
      expect(capturedUrl).toBe(
        `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`,
      );

      const headers = capturedInit?.headers as Record<string, string>;
      expect(headers["Accept"]).toBe("application/json, text/plain, */*");
      expect(headers["User-Agent"]).toContain("Mozilla/5.0");
      expect(capturedInit?.signal).toBeInstanceOf(AbortSignal);

      expect(meta).toEqual({
        id: "abc",
        title: "视频标题",
        thumbnail_url: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
        fetched_at: 999,
      });

      // 成功后写入磁盘缓存，后续调用命中缓存不再请求
      expect(existsSync(path.join(tempDir, "youtube.json"))).toBe(true);
      const again = await fetchYouTubeMeta("abc", { cacheDir: tempDir, fetchFn: mockFetch as any });
      expect(again).toEqual(meta);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("超时时间透传给 AbortSignal.timeout", async () => {
      const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
      const mockFetch = vi.fn(async () => okResponse({ title: "t" }));

      await fetchYouTubeMeta("vid", { cacheDir: tempDir, fetchFn: mockFetch as any, timeoutMs: 3210 });
      expect(timeoutSpy).toHaveBeenCalledWith(3210);
    });

    it("未注入 fetchFn 时回退到全局 fetch", async () => {
      const mockFetch = vi.fn(async () => okResponse({ title: "全局 fetch 视频" }));
      vi.stubGlobal("fetch", mockFetch);

      const meta = await fetchYouTubeMeta("globalVid", { cacheDir: tempDir, now: () => 7 });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(meta?.title).toBe("全局 fetch 视频");
      expect(meta?.fetched_at).toBe(7);
    });

    it("响应缺少 thumbnail_url 时降级为空字符串", async () => {
      const mockFetch = vi.fn(async () => okResponse({ title: "无封面视频" }));
      const meta = await fetchYouTubeMeta("noThumb", { cacheDir: tempDir, fetchFn: mockFetch as any });
      expect(meta?.thumbnail_url).toBe("");
    });

    it("同一 id 并发请求只发起一次网络调用（inflight 去重）", async () => {
      const mockFetch = vi.fn(
        async () => okResponse({ title: "并发视频", thumbnail_url: "https://i.ytimg.com/vi/x.jpg" }),
      );

      const [a, b] = await Promise.all([
        fetchYouTubeMeta("dup", { cacheDir: tempDir, fetchFn: mockFetch as any }),
        fetchYouTubeMeta("dup", { cacheDir: tempDir, fetchFn: mockFetch as any }),
      ]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(a).toEqual(b);
    });
  });

  describe("fetchYouTubeMeta 错误与降级分支", () => {
    it("HTTP 错误状态（!ok）降级为 null 并告警", async () => {
      const warnFn = vi.fn();
      const mockFetch = vi.fn(async () => ({ ok: false, status: 404 }) as unknown as Response);

      const meta = await fetchYouTubeMeta("badVid", {
        cacheDir: tempDir,
        fetchFn: mockFetch as any,
        warn: warnFn,
      });

      expect(meta).toBeNull();
      expect(warnFn).toHaveBeenCalledTimes(1);
      expect(warnFn.mock.calls[0][0]).toContain("badVid");
      expect(warnFn.mock.calls[0][0]).toContain("HTTP 404");
      // 失败不写入缓存
      expect(loadYouTubeCache(tempDir)["badVid"]).toBeUndefined();
    });

    it("响应缺少 title 时降级为 null 并告警", async () => {
      const warnFn = vi.fn();
      const mockFetch = vi.fn(async () => okResponse({ thumbnail_url: "https://i.ytimg.com/x.jpg" }));

      const meta = await fetchYouTubeMeta("noTitle", {
        cacheDir: tempDir,
        fetchFn: mockFetch as any,
        warn: warnFn,
      });

      expect(meta).toBeNull();
      expect(warnFn.mock.calls[0][0]).toContain("Missing title");
    });

    it("网络异常（fetch reject，含超时 AbortError）降级为 null 并告警", async () => {
      const warnFn = vi.fn();
      const mockFetch = vi.fn(async () => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      });

      const meta = await fetchYouTubeMeta("timeoutVid", {
        cacheDir: tempDir,
        fetchFn: mockFetch as any,
        warn: warnFn,
      });

      expect(meta).toBeNull();
      expect(warnFn).toHaveBeenCalledTimes(1);
      expect(warnFn.mock.calls[0][0]).toContain("timeoutVid");
    });

    it("失败后 inflight 清理：再次调用会重新发起请求", async () => {
      const warnFn = vi.fn();
      const mockFetch = vi
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce(okResponse({ title: "重试成功" }));

      const first = await fetchYouTubeMeta("retry", {
        cacheDir: tempDir,
        fetchFn: mockFetch as any,
        warn: warnFn,
      });
      expect(first).toBeNull();

      const second = await fetchYouTubeMeta("retry", {
        cacheDir: tempDir,
        fetchFn: mockFetch as any,
        warn: warnFn,
      });
      expect(second?.title).toBe("重试成功");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
