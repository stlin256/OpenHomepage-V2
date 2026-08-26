import { describe, expect, it } from 'vitest';
import { withBase, stripBase } from '../src/lib/base-url.ts';

describe('withBase', () => {
  it('handles root base /', () => {
    expect(withBase('/', '/')).toBe('/');
    expect(withBase('/research', '/')).toBe('/research');
    expect(withBase('/assets/hero.jpg', '/')).toBe('/assets/hero.jpg');
    expect(withBase('assets/hero.jpg', '/')).toBe('/assets/hero.jpg');
  });

  it('prefixes with subpath base', () => {
    expect(withBase('/', '/OpenHomepage-V2/')).toBe('/OpenHomepage-V2/');
    expect(withBase('/research', '/OpenHomepage-V2/')).toBe('/OpenHomepage-V2/research');
    expect(withBase('/en/', '/OpenHomepage-V2/')).toBe('/OpenHomepage-V2/en/');
    expect(withBase('/en/research', '/OpenHomepage-V2/')).toBe('/OpenHomepage-V2/en/research');
    expect(withBase('/assets/hero.jpg', '/OpenHomepage-V2/')).toBe('/OpenHomepage-V2/assets/hero.jpg');
  });

  it('avoids double-prefixing', () => {
    expect(withBase('/OpenHomepage-V2/research', '/OpenHomepage-V2/')).toBe('/OpenHomepage-V2/research');
    expect(withBase('/OpenHomepage-V2/', '/OpenHomepage-V2/')).toBe('/OpenHomepage-V2/');
  });

  it('preserves external and special URLs', () => {
    expect(withBase('https://github.com', '/OpenHomepage-V2/')).toBe('https://github.com');
    expect(withBase('mailto:me@example.com', '/OpenHomepage-V2/')).toBe('mailto:me@example.com');
    expect(withBase('#section', '/OpenHomepage-V2/')).toBe('#section');
  });
});

describe('stripBase', () => {
  it('strips base from subpath URLs', () => {
    expect(stripBase('/OpenHomepage-V2/', '/OpenHomepage-V2/')).toBe('/');
    expect(stripBase('/OpenHomepage-V2', '/OpenHomepage-V2/')).toBe('/');
    expect(stripBase('/OpenHomepage-V2/research', '/OpenHomepage-V2/')).toBe('/research');
    expect(stripBase('/OpenHomepage-V2/en/research', '/OpenHomepage-V2/')).toBe('/en/research');
  });

  it('keeps paths intact when not matching base', () => {
    expect(stripBase('/research', '/OpenHomepage-V2/')).toBe('/research');
    expect(stripBase('/research', '/')).toBe('/research');
  });
});