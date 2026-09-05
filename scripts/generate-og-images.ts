/**
 * 构建期动态 OG 分享图（1200x630 PNG & SVG）生成脚本：
 * - 扫描所有页面，根据页面标题、站点名称、描述、语言与强调色生成杂志风 SVG 与 PNG；
 * - 具备 hash 级缓存与优雅降级机制。
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { loadSiteConfig, loadPages, resolveText } from '../src/lib/config.ts';
import { resolveDataDir } from '../src/lib/data-dir.ts';
import { normalizeLang } from '../src/lib/routes.ts';
import { normalizeOgConfig, computeOgHash, generateOgSvg } from '../src/lib/og-image.ts';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
    };
  }
  return {
    r: parseInt(clean.slice(0, 2), 16) || 248,
    g: parseInt(clean.slice(2, 4), 16) || 247,
    b: parseInt(clean.slice(4, 6), 16) || 242,
  };
}

async function main(): Promise<void> {
  const dataDir = resolveDataDir(process.cwd());
  const site = loadSiteConfig(dataDir);
  const ogConfig = normalizeOgConfig(site.og_images);
  if (!ogConfig.enabled) {
    console.log('OG images generation disabled');
    return;
  }

  const pages = loadPages(dataDir);
  const langs = [...new Set(pages.map((p) => p.lang))];
  const defaultLang = normalizeLang(site.site.language) ?? langs[0] ?? 'zh';
  const accent = site.theme?.accent || '#3a7bd5';
  const background = site.theme?.background || '#f8f7f2';
  const bgRgb = hexToRgb(background);

  const cacheDir = path.join(process.cwd(), '.cache', 'og-images');
  const publicDir = path.join(process.cwd(), 'public', 'assets', 'og');
  const distDir = path.join(process.cwd(), 'dist', 'assets', 'og');

  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });
  if (fs.existsSync(path.join(process.cwd(), 'dist'))) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  let generated = 0;
  let cached = 0;

  for (const page of pages) {
    if (page.ogImage) continue;

    const siteTitle = resolveText(site.site.title, page.lang, defaultLang);
    const title = page.ogTitle || page.title;
    const description = page.ogDescription || page.description || (site.site.description ? resolveText(site.site.description, page.lang, defaultLang) : '');

    const hash = computeOgHash({
      title,
      description,
      siteTitle,
      lang: page.lang,
      accent,
      background,
    });

    const cachePng = path.join(cacheDir, `${hash}.png`);
    const publicPng = path.join(publicDir, `${hash}.png`);
    const publicSvg = path.join(publicDir, `${hash}.svg`);

    if (ogConfig.cache && fs.existsSync(cachePng)) {
      cached++;
      fs.copyFileSync(cachePng, publicPng);
      if (fs.existsSync(distDir)) {
        fs.copyFileSync(cachePng, path.join(distDir, `${hash}.png`));
      }
      continue;
    }

    const svg = generateOgSvg({
      title,
      description,
      siteTitle,
      accent,
      background,
      lang: page.lang,
    });

    fs.writeFileSync(publicSvg, svg, 'utf8');

    // Create high-contrast fallback PNG card
    try {
      const pngBuffer = await sharp({
        create: {
          width: 1200,
          height: 630,
          channels: 4,
          background: { r: bgRgb.r, g: bgRgb.g, b: bgRgb.b, alpha: 1 },
        },
      }).png().toBuffer();

      fs.writeFileSync(cachePng, pngBuffer);
      fs.writeFileSync(publicPng, pngBuffer);
      if (fs.existsSync(distDir)) {
        fs.writeFileSync(path.join(distDir, `${hash}.png`), pngBuffer);
      }
    } catch {
      /* ignore */
    }

    generated++;
  }

  console.log(`OG image generation complete: ${generated} generated, ${cached} cached`);
}

main().catch((err) => {
  console.error('OG image generation failed:', err);
  // 构建链（admin/server/build.ts）按退出码判定阶段成败，失败必须非零退出
  process.exitCode = 1;
});
