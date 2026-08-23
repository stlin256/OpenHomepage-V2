import { describe, it, expect } from 'vitest';
import { fullVariantUrl, pickLightboxSrc } from '../src/lib/lightbox.ts';

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
