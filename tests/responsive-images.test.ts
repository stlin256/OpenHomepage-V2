import { describe, expect, it } from 'vitest';
import { chooseResponsiveCandidate, parseImageSizes, responsiveWidthsForLayout } from '../src/lib/responsive-images.ts';

describe('responsive image helpers', () => {
  it('parses media conditions and fixed sizes', () => {
    expect(parseImageSizes('(max-width: 768px) 41vw, 332px')).toEqual([
      { media: '(max-width: 768px)', maxWidth: 315 },
      { maxWidth: 332 },
    ]);
    expect(parseImageSizes('48px')).toEqual([{ maxWidth: 48 }]);
    expect(parseImageSizes('calc(100vw - 64px)')).toEqual([{ maxWidth: 1216 }]);
  });

  it('generates even 1x, 2x, and 3x widths', () => {
    expect(responsiveWidthsForLayout(157, 1600)).toEqual([158, 314, 472]);
    expect(responsiveWidthsForLayout(332, 512)).toEqual([332, 512]);
  });

  it('chooses the exact DPR candidate when available', () => {
    const srcset = '/a.1.avif 1x, /a.2.avif 2x, /a.3.avif 3x';
    expect(chooseResponsiveCandidate(srcset, 1)).toEqual({ src: '/a.1.avif', descriptor: 1 });
    expect(chooseResponsiveCandidate(srcset, 2)).toEqual({ src: '/a.2.avif', descriptor: 2 });
    expect(chooseResponsiveCandidate(srcset, 3)).toEqual({ src: '/a.3.avif', descriptor: 3 });
    expect(chooseResponsiveCandidate(srcset, 4)).toEqual({ src: '/a.3.avif', descriptor: 3 });
  });
});
