/**
 * favicon 上传自动转换（编辑器站点配置）：
 * 上传 JPG/PNG/WebP 等 → 居中裁方形 → 缩放生成 180×180 与 32×32 PNG 存入
 * data/assets/，写回 site.yaml 的 site.favicon（指向 180 版本）。
 * 选型：jimp（纯 JS，无原生编译，离线可装；sharp 备选但带原生二进制）。
 * 裁剪/尺寸决策为纯函数（faviconCropPlan），jimp 转换真实图片有 fixture 测试。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Jimp } from 'jimp';
import { readSiteConfig, writeSiteConfig } from './configs.ts';

/** 输出的 favicon 尺寸（180 = apple-touch-icon 档，32 = 经典 favicon 档） */
export const FAVICON_SIZES = [180, 32] as const;

export interface FaviconOutputs {
  png180: Buffer;
  png32: Buffer;
}

/** 居中裁方形（纯函数）：边长取短边，原点居中；奇数差值向下取整 */
export function faviconCropPlan(
  width: number,
  height: number,
): { x: number; y: number; size: number } {
  const size = Math.min(width, height);
  return { x: Math.floor((width - size) / 2), y: Math.floor((height - size) / 2), size };
}

/** 图片 buffer → 居中方形 → 180×180 / 32×32 PNG；非图片抛中文错误 */
export async function convertFavicon(buf: Buffer): Promise<FaviconOutputs> {
  let img;
  try {
    img = await Jimp.read(buf);
  } catch {
    throw new Error('不支持的图片格式或文件损坏（支持 JPG/PNG/WebP/GIF 等常见格式）');
  }
  const { x, y, size } = faviconCropPlan(img.bitmap.width, img.bitmap.height);
  img.crop({ x, y, w: size, h: size });
  const png180 = await img.clone().resize({ w: FAVICON_SIZES[0], h: FAVICON_SIZES[0] }).getBuffer('image/png');
  const png32 = await img.resize({ w: FAVICON_SIZES[1], h: FAVICON_SIZES[1] }).getBuffer('image/png');
  return { png180, png32 };
}

/** 两个尺寸落盘 data/assets/ 并写回 site.favicon（写回走校验 + 快照，与配置保存同路径） */
export function saveFavicon(dataDir: string, outputs: FaviconOutputs): { favicon: string; files: string[] } {
  const dir = path.join(dataDir, 'assets');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'favicon-180.png'), outputs.png180);
  writeFileSync(path.join(dir, 'favicon-32.png'), outputs.png32);
  const cfg = readSiteConfig(dataDir);
  cfg.site.favicon = 'assets/favicon-180.png';
  writeSiteConfig(dataDir, cfg);
  return { favicon: 'assets/favicon-180.png', files: ['assets/favicon-180.png', 'assets/favicon-32.png'] };
}
