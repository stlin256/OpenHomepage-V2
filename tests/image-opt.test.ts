import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { isConvertibleAssetPath, webpAssetPath, webpImageUrl } from '../src/lib/image-opt.ts';
import { optimizeDistImages } from '../scripts/optimize-images.ts';

describe('image path optimization', () => {
  it('identifies ordinary local raster assets only', () => {
    expect(isConvertibleAssetPath('assets/hero.jpg')).toBe(true);
    expect(isConvertibleAssetPath('assets/nested/photo.jpeg')).toBe(true);
    expect(isConvertibleAssetPath('assets/diagram.png')).toBe(true);
    expect(isConvertibleAssetPath('assets/hero-full.jpg')).toBe(false);
    expect(isConvertibleAssetPath('assets/avatar.svg')).toBe(false);
    expect(isConvertibleAssetPath('https://example.com/a.jpg')).toBe(false);
  });

  it('derives same-stem WebP paths', () => {
    expect(webpAssetPath('assets/hero.jpg')).toBe('assets/hero.webp');
    expect(webpAssetPath('assets/a.b/c.png')).toBe('assets/a.b/c.webp');
    expect(webpAssetPath('assets/hero-full.jpg')).toBeNull();
  });

  it('resolves URLs under the deploy base and preserves query/hash', () => {
    const available = new Set(['assets/hero.webp']);
    expect(webpImageUrl('/OpenHomepage-V2/assets/hero.jpg?v=2#top', available)).toBe(
      '/OpenHomepage-V2/assets/hero.webp?v=2#top',
    );
    expect(webpImageUrl('/assets/hero.jpg', available)).toBe('/assets/hero.webp');
    expect(webpImageUrl('/assets/hero-full.jpg', available)).toBeNull();
    expect(webpImageUrl('https://cdn.example/assets/hero.jpg', available)).toBeNull();
  });
});

describe('optimizeDistImages', () => {
  it('converts assets and rewrites HTML while retaining originals for the lightbox', async () => {
    const dist = mkdtempSync(path.join(tmpdir(), 'openhomepage-webp-'));
    mkdirSync(path.join(dist, 'assets'), { recursive: true });
    const png = await sharp({
      create: {
        width: 128,
        height: 128,
        channels: 4,
        background: { r: 40, g: 90, b: 160, alpha: 1 },
      },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg width="128" height="128"><circle cx="64" cy="64" r="52" fill="#f4d35e"/><rect width="128" height="16" fill="#ee6c4d"/></svg>',
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
        '<img src="/site/assets/hero.png" srcset="/site/assets/hero.png 1x">',
        '<span style="--tile-image:url(\'/site/assets/hero.png\')"></span>',
        '</body></html>',
      ].join(''),
      'utf8',
    );

    const result = await optimizeDistImages(dist, 80);
    const html = readFileSync(path.join(dist, 'index.html'), 'utf8');

    expect(result.converted).toBe(1);
    expect(existsSync(path.join(dist, 'assets/hero.webp'))).toBe(true);
    expect(existsSync(path.join(dist, 'assets/hero.png'))).toBe(true);
    expect(existsSync(path.join(dist, 'assets/hero-full.webp'))).toBe(false);
    expect(html).toContain('data-original="/site/assets/hero.png"');
    expect(html).toContain('src="/site/assets/hero.webp"');
    expect(html).toContain('srcset="/site/assets/hero.webp 1x"');
    expect(html).toContain('url(\'/site/assets/hero.webp\')');
  });
});
