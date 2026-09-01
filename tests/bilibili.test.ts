import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  fetchBilibiliMeta,
  loadBilibiliCache,
  saveBilibiliCache,
  resetBilibiliState,
} from "../src/lib/bilibili.ts";

describe("src/lib/bilibili.ts", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "oh-bilibili-test-"));
    resetBilibiliState();
  });

  it("自动为 API 请求添加 Referer 请求头并解析标题与封面", async () => {
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};

    const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = (init?.headers as Record<string, string>) ?? {};
      return {
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            title: "测试视频标题",
            pic: "http://i0.hdslb.com/bfs/archive/test.jpg",
          },
        }),
      } as unknown as Response;
    });

    const meta = await fetchBilibiliMeta("BV1xx411c7mD", {
      cacheDir: tempDir,
      fetchFn: mockFetch as any,
    });

    expect(capturedUrl).toContain("bvid=BV1xx411c7mD");
    expect(capturedHeaders["Referer"]).toBe("https://www.bilibili.com/");
    expect(meta).not.toBeNull();
    expect(meta?.title).toBe("测试视频标题");
    expect(meta?.pic).toBe("https://i0.hdslb.com/bfs/archive/test.jpg");
  });

  it("容错支持全小写 bv 前缀并规范化为 BV", async () => {
    let capturedUrl = "";
    const mockFetch = vi.fn(async (url: string) => {
      capturedUrl = url;
      return {
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            title: "小写前缀测试",
            pic: "https://i0.hdslb.com/bfs/archive/test.jpg",
          },
        }),
      } as unknown as Response;
    });

    const meta = await fetchBilibiliMeta("bv1xx411c7mD", {
      cacheDir: tempDir,
      fetchFn: mockFetch as any,
    });

    expect(capturedUrl).toContain("bvid=BV1xx411c7mD");
    expect(meta?.bvid).toBe("BV1xx411c7mD");
  });

  it("容错协议相对封面 URL (//i0.hdslb.com/...)", async () => {
    const mockFetch = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            title: "协议相对封面",
            pic: "//i0.hdslb.com/bfs/archive/protocol-relative.jpg",
          },
        }),
      } as unknown as Response;
    });

    const meta = await fetchBilibiliMeta("BV1xx411c7mD", {
      cacheDir: tempDir,
      fetchFn: mockFetch as any,
    });

    expect(meta?.pic).toBe("https://i0.hdslb.com/bfs/archive/protocol-relative.jpg");
  });

  it("优先命中缓存，不发起重复网络请求", async () => {
    saveBilibiliCache(
      {
        BV1cached: {
          bvid: "BV1cached",
          title: "缓存视频",
          pic: "https://i0.hdslb.com/bfs/archive/cached.jpg",
          fetched_at: 123456789,
        },
      },
      tempDir,
    );

    const mockFetch = vi.fn();
    const meta = await fetchBilibiliMeta("BV1cached", {
      cacheDir: tempDir,
      fetchFn: mockFetch as any,
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(meta?.title).toBe("缓存视频");
  });

  it("网络或 API 错误时优雅降级为 null 并告警，不抛出未捕获异常", async () => {
    const warnFn = vi.fn();
    const mockFetch = vi.fn(async () => {
      return {
        ok: false,
        status: 500,
      } as unknown as Response;
    });

    const meta = await fetchBilibiliMeta("BV1error", {
      cacheDir: tempDir,
      fetchFn: mockFetch as any,
      warn: warnFn,
    });

    expect(meta).toBeNull();
    expect(warnFn).toHaveBeenCalled();
  });
});
