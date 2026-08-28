import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  inferImageSizes,
  isConvertibleAssetPath,
  responsiveWebpAssetPath,
  responsiveWebpImageUrl,
  webpAssetPath,
  webpImageUrl,
} from '../src/lib/image-opt.ts';
import { JSDOM } from 'jsdom';
import { optimizeDistImages } from '../scripts/optimize-images.ts';

describe('image path optimization', () => {
  it('identifies ordinary local raster assets only', () => {
    expect(isConvertibleAssetPath('assets/hero.jpg')).toBe(true);
    expect(isConvertibleAssetPath('assets/nested/photo.jpeg')).toBe(true);
    expect(isConvertibleAssetPath('assets/diagram.png')).toBe(true);
    expect(isConvertibleAssetPath('assets/photo.webp')).toBe(true);
    expect(isConvertibleAssetPath('assets/photo.480.webp')).toBe(false);
    expect(isConvertibleAssetPath('assets/hero-full.jpg')).toBe(false);
    expect(isConvertibleAssetPath('assets/avatar.svg')).toBe(false);
    expect(isConvertibleAssetPath('https://example.com/a.jpg')).toBe(false);
  });

  it('derives same-stem WebP paths', () => {
    expect(webpAssetPath('assets/hero.jpg')).toBe('assets/hero.webp');
    expect(webpAssetPath('assets/a.b/c.png')).toBe('assets/a.b/c.webp');
    expect(webpAssetPath('assets/hero-full.jpg')).toBeNull();
    expect(responsiveWebpAssetPath('assets/hero.jpg', 768)).toBe('assets/hero.768.webp');
    expect(responsiveWebpAssetPath('assets/hero-full.jpg', 768)).toBeNull();
  });

  it('resolves URLs under the deploy base and preserves query/hash', () => {
    const available = new Set(['assets/hero.webp']);
    expect(webpImageUrl('/OpenHomepage-V2/assets/hero.jpg?v=2#top', available)).toBe(
      '/OpenHomepage-V2/assets/hero.webp?v=2#top',
    );
    expect(webpImageUrl('/assets/hero.jpg', available)).toBe('/assets/hero.webp');
    expect(webpImageUrl('/assets/hero-full.jpg', available)).toBeNull();
    expect(webpImageUrl('https://cdn.example/assets/hero.jpg', available)).toBeNull();
    expect(responsiveWebpImageUrl('/site/assets/hero.jpg?v=2#top', 768, new Set(['assets/hero.768.webp']))).toBe(
      '/site/assets/hero.768.webp?v=2#top',
    );
  });

  it('infers markdown and grid display widths', () => {
    const { document } = new JSDOM('<main></main>').window;
    const full = document.createElement('img');
    document.body.append(full);
    expect(inferImageSizes(full)).toContain('(max-width: 768px) calc(100vw - 64px)');

    const grid = document.createElement('div');
    grid.className = 'md-grid';
    grid.setAttribute('style', 'grid-template-columns:repeat(2,1fr)');
    const figure = document.createElement('figure');
    figure.setAttribute('style', 'width:72%');
    const gridded = document.createElement('img');
    figure.append(gridded);
    grid.append(figure);
    document.body.append(grid);
    const sizes = inferImageSizes(gridded);
    // 桌面端按栏宽（两栏减 24px 间距）×72%；移动端 md-grid 收敛单列，占满内容宽
    expect(sizes).toContain('(max-width: 768px) calc((calc(100vw - 64px)) * 0.72)');
    expect(sizes).toContain('(max-width: 1264px)');
    expect(sizes).toContain('100vw - 240px - 24px');
    expect(sizes).toContain('* 0.72');
  });
});

describe('optimizeDistImages', () => {
  it('converts assets and rewrites HTML while retaining originals for the lightbox', async () => {
    const dist = mkdtempSync(path.join(tmpdir(), 'openhomepage-webp-'));
    mkdirSync(path.join(dist, 'assets'), { recursive: true });
    const png = await sharp({
      create: {
        width: 1400,
        height: 900,
        channels: 4,
        background: { r: 40, g: 90, b: 160, alpha: 1 },
      },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg width="1400" height="900"><circle cx="700" cy="450" r="520" fill="#f4d35e"/><rect width="1400" height="120" fill="#ee6c4d"/></svg>',
          ),
        },
      ])
      .png()
      .toBuffer();
    writeFileSync(path.join(dist, 'assets/hero.png'), png);
    writeFileSync(path.join(dist, 'assets/hero-full.png'), png);
    writeFileSync(
      path.join(dist, 'index.html'),
      [
        '<!doctype html><html><body>',
        '<img src="/site/assets/hero.png">',
        '<img src="/site/assets/hero.png" srcset="/site/assets/hero.png 1x">',
        '<span style="--tile-image:url(\'/site/assets/hero.png\')"></span>',
        '</body></html>',
      ].join(''),
      'utf8',
    );

    const result = await optimizeDistImages(dist, 80);
    const html = readFileSync(path.join(dist, 'index.html'), 'utf8');

    expect(result.converted).toBe(1);
    expect(result.variantsCreated).toBe(3);
    expect(existsSync(path.join(dist, 'assets/hero.webp'))).toBe(true);
    expect(existsSync(path.join(dist, 'assets/hero.480.webp'))).toBe(true);
    expect(existsSync(path.join(dist, 'assets/hero.768.webp'))).toBe(true);
    expect(existsSync(path.join(dist, 'assets/hero.1024.webp'))).toBe(true);
    expect(existsSync(path.join(dist, 'assets/hero.1440.webp'))).toBe(false);
    expect(existsSync(path.join(dist, 'assets/hero.png'))).toBe(true);
    expect(existsSync(path.join(dist, 'assets/hero-full.webp'))).toBe(false);
    expect(html).toContain('data-original="/site/assets/hero.png"');
    expect(html).toContain('src="/site/assets/hero.webp"');
    // src-only 与自带 srcset 的图片都应获得同一组响应式候选
    const responsiveSrcset =
      'srcset="/site/assets/hero.480.webp 480w, /site/assets/hero.768.webp 768w, /site/assets/hero.1024.webp 1024w, /site/assets/hero.webp 1400w"';
    expect(html.split(responsiveSrcset).length - 1).toBe(2);
    expect(html).toContain('sizes="(max-width: 768px) calc(100vw - 64px)');
    expect(html).toContain('url(\'/site/assets/hero.webp\')');
  });
});
