/**
 * favicon 上传自动转换（admin/server/favicon.ts）单测：
 * 居中裁方形纯函数、jimp 真实图片转换（180×180 + 32×32 PNG）、
 * HTTP 路由写回 site.yaml；坏图 400。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Jimp } from 'jimp';
import { faviconCropPlan, convertFavicon, FAVICON_SIZES } from '../admin/server/favicon.ts';
import { createAdminServer } from '../admin/server/http.ts';

const SITE = 'site:\n  title: 测试站\nprofile:\n  name: 张三\ngithub:\n  username: zhangsan\n';

/** 真实图片 fixture：400×200 渐变 PNG（jimp 生成，避免提交二进制） */
async function fixturePng(width = 400, height = 200): Promise<Buffer> {
  const img = new Jimp({ width, height, color: 0xff336699 });
  img.scan(0, 0, width, height, (x, y, idx) => {
    img.bitmap.data[idx] = (x * 255) / width; // R 渐变
    img.bitmap.data[idx + 1] = (y * 255) / height; // G 渐变
  });
  return img.getBuffer('image/png');
}

describe('faviconCropPlan（纯函数：居中裁方形）', () => {
  it('横图裁左右、竖图裁上下、方图不裁', () => {
    expect(faviconCropPlan(400, 200)).toEqual({ x: 100, y: 0, size: 200 });
    expect(faviconCropPlan(200, 400)).toEqual({ x: 0, y: 100, size: 200 });
    expect(faviconCropPlan(300, 300)).toEqual({ x: 0, y: 0, size: 300 });
    // 奇数尺寸向下取整
    expect(faviconCropPlan(401, 201)).toEqual({ x: 100, y: 0, size: 201 });
  });
});

describe('convertFavicon（jimp 真实转换）', () => {
  it('400×200 PNG → 居中裁方后输出 180×180 与 32×32 PNG', async () => {
    const { png180, png32 } = await convertFavicon(await fixturePng());
    // PNG 签名
    expect(png180[0]).toBe(0x89);
    expect(png180[1]).toBe(0x50);
    const back180 = await Jimp.read(png180);
    expect([back180.bitmap.width, back180.bitmap.height]).toEqual([180, 180]);
    const back32 = await Jimp.read(png32);
    expect([back32.bitmap.width, back32.bitmap.height]).toEqual([32, 32]);
    expect(FAVICON_SIZES).toEqual([180, 32]);
  });

  it('非图片内容抛中文错误', async () => {
    await expect(convertFavicon(Buffer.from('not an image'))).rejects.toThrow(/图片|格式/);
  });
});

describe('POST /api/favicon', () => {
  let root: string;
  let dataDir: string;
  let server: Server;
  let base: string;

  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'oh-favicon-'));
    dataDir = path.join(root, 'data');
    mkdirSync(path.join(dataDir, 'assets'), { recursive: true });
    writeFileSync(path.join(dataDir, 'site.yaml'), SITE);
    server = createAdminServer({ dataDir, initialized: false, appJs: '' });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise((r) => server.close(r));
    rmSync(root, { recursive: true, force: true });
  });

  it('上传图片 → 生成两个尺寸存入 assets，写回 site.favicon', async () => {
    const res = await fetch(`${base}/api/favicon`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: await fixturePng(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { favicon: string; files: string[] };
    expect(body.favicon).toBe('assets/favicon-180.png');
    expect(body.files).toContain('assets/favicon-32.png');
    expect(existsSync(path.join(dataDir, 'assets', 'favicon-180.png'))).toBe(true);
    expect(existsSync(path.join(dataDir, 'assets', 'favicon-32.png'))).toBe(true);
    // site.yaml 写回（且经过 schema 校验）
    expect(readFileSync(path.join(dataDir, 'site.yaml'), 'utf8')).toContain('favicon-180.png');
  });

  it('非图片 → 400，不落盘不改配置', async () => {
    const res = await fetch(`${base}/api/favicon`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: Buffer.from('definitely not an image'),
    });
    expect(res.status).toBe(400);
    expect(existsSync(path.join(dataDir, 'assets', 'favicon-180.png'))).toBe(false);
    expect(readFileSync(path.join(dataDir, 'site.yaml'), 'utf8')).toBe(SITE);
  });
});
