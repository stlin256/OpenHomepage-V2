import { describe, it, expect, beforeEach } from 'vitest';
import {
  fullBad,
  fullVariantUrl,
  isLightboxBad,
  lightboxCandidateUrls,
  markLightboxBad,
  pickLightboxSrc,
  resetLightboxBad,
} from '../src/lib/lightbox.ts';

describe('fullVariantUrl（-full 高分辨率变体约定）', () => {
  it('普通相对路径加 -full 后缀', () => {
    expect(fullVariantUrl('assets/hero.jpg')).toBe('assets/hero-full.jpg');
    expect(fullVariantUrl('assets/sub/dir/photo.png')).toBe('assets/sub/dir/photo-full.png');
  });

  it('保留扩展名大小写与查询串/hash', () => {
    expect(fullVariantUrl('assets/hero.JPG')).toBe('assets/hero-full.JPG');
    expect(fullVariantUrl('assets/hero.jpg?v=2')).toBe('assets/hero-full.jpg?v=2');
    expect(fullVariantUrl('https://example.com/a.webp#x')).toBe('https://example.com/a-full.webp#x');
  });

  it('无扩展名 / data: / blob: / 已是 -full 变体时返回 null', () => {
    expect(fullVariantUrl('assets/README')).toBeNull();
    expect(fullVariantUrl('data:image/png;base64,xxxx')).toBeNull();
    expect(fullVariantUrl('blob:https://example.com/uuid')).toBeNull();
    expect(fullVariantUrl('assets/hero-full.jpg')).toBeNull();
    expect(fullVariantUrl('')).toBeNull();
  });
});

describe('pickLightboxSrc（灯箱加载地址决策）', () => {
  it('hasFull 判定存在时用高清变体，否则用原图', () => {
    expect(pickLightboxSrc('assets/hero.jpg', () => true)).toBe('assets/hero-full.jpg');
    expect(pickLightboxSrc('assets/hero.jpg', () => false)).toBe('assets/hero.jpg');
    expect(pickLightboxSrc('assets/hero.jpg', (u) => u === 'assets/hero-full.jpg')).toBe(
      'assets/hero-full.jpg'
    );
  });

  it('hasFull 缺省时乐观假定变体存在（调用方回退）', () => {
    expect(pickLightboxSrc('assets/hero.jpg')).toBe('assets/hero-full.jpg');
  });

  it('无变体可派生时一律用原图', () => {
    expect(pickLightboxSrc('data:image/png;base64,x', () => true)).toBe('data:image/png;base64,x');
    expect(pickLightboxSrc('assets/hero-full.jpg')).toBe('assets/hero-full.jpg');
  });
});

describe('WebP 页面图的原图回退', () => {
  it('候选顺序为原图 -full、原图、页面 -full、页面图', () => {
    expect(lightboxCandidateUrls('/assets/hero.webp', '/assets/hero.jpg')).toEqual([
      '/assets/hero-full.jpg',
      '/assets/hero.jpg',
      '/assets/hero.webp',
    ]);
  });

  it('原图 -full 不可用时优先原图，而不是页面 WebP', () => {
    const bad = new Set(['/assets/hero-full.jpg']);
    expect(pickLightboxSrc('/assets/hero.webp', (url) => !bad.has(url), '/assets/hero.jpg')).toBe(
      '/assets/hero.jpg',
    );
  });

  it('原图也不可用时才回退页面 WebP', () => {
    const bad = new Set(['/assets/hero-full.jpg', '/assets/hero.jpg']);
    expect(pickLightboxSrc('/assets/hero.webp', (url) => !bad.has(url), '/assets/hero.jpg')).toBe(
      '/assets/hero.webp',
    );
  });
});

describe('fullBad 共享失败缓存与辅助函数', () => {
  beforeEach(() => {
    resetLightboxBad();
  });

  it('markLightboxBad 记录失败 URL 并在 isLightboxBad 返回', () => {
    expect(isLightboxBad('/assets/missing-full.jpg')).toBe(false);
    markLightboxBad('/assets/missing-full.jpg');
    expect(isLightboxBad('/assets/missing-full.jpg')).toBe(true);
    expect(fullBad.has('/assets/missing-full.jpg')).toBe(true);
  });

  it('resetLightboxBad 清空失败集合', () => {
    markLightboxBad('/assets/bad1.jpg');
    markLightboxBad('/assets/bad2.jpg');
    expect(fullBad.size).toBe(2);
    resetLightboxBad();
    expect(fullBad.size).toBe(0);
    expect(isLightboxBad('/assets/bad1.jpg')).toBe(false);
  });

  it('结合 fullBad 执行 pickLightboxSrc', () => {
    markLightboxBad('/assets/hero-full.jpg');
    expect(
      pickLightboxSrc('/assets/hero.webp', (url) => !fullBad.has(url), '/assets/hero.jpg')
    ).toBe('/assets/hero.jpg');
  });
});
