import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { optimizeCriticalCss } from '../scripts/optimize-critical-css.ts';

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('optimize-critical-css', () => {
  it('keeps notice banner JS initial state in critical CSS to avoid first-paint flash', async () => {
    const dist = mkdtempSync(path.join(os.tmpdir(), 'openhomepage-critical-notice-'));
    tempDirs.push(dist);
    mkdirSync(path.join(dist, '_astro'), { recursive: true });
    writeFileSync(
      path.join(dist, '_astro', 'test.css'),
      '.notice-banner{display:flex}html.js .notice-banner{opacity:0;max-height:0}html.js .notice-banner.visible{opacity:1}',
      'utf8',
    );
    writeFileSync(
      path.join(dist, 'index.html'),
      '<!doctype html><html><head><link rel="stylesheet" href="/_astro/test.css"></head><body><aside class="notice-banner">Notice</aside></body></html>',
      'utf8',
    );

    await optimizeCriticalCss(dist);
    const html = readFileSync(path.join(dist, 'index.html'), 'utf8');

    expect(html).toContain('html.js .notice-banner{opacity:0;max-height:0}');
    expect(html).toContain('html.js .notice-banner.visible{opacity:1}');
  });

  it('inlines used critical CSS and lazy-loads the full stylesheet', async () => {
    const dist = mkdtempSync(path.join(os.tmpdir(), 'openhomepage-critical-'));
    tempDirs.push(dist);
    mkdirSync(path.join(dist, '_astro'), { recursive: true });
    writeFileSync(path.join(dist, '_astro', 'test.css'), ':root{--critical:red}.unused{color:blue}', 'utf8');
    writeFileSync(
      path.join(dist, 'index.html'),
      '<!doctype html><html><head><link rel="stylesheet" href="/_astro/test.css"></head><body><main>Hello</main></body></html>',
      'utf8',
    );

    const result = await optimizeCriticalCss(dist);
    const html = readFileSync(path.join(dist, 'index.html'), 'utf8');

    expect(result.pages).toBe(1);
    expect(result.criticalBytes).toBeGreaterThan(0);
    expect(html).toContain('<style>');
    expect(html).toContain('--critical:red');
    expect(html).not.toContain('.unused{color:blue}');
    expect(html).toContain('rel="preload"');
    expect(html).toContain('<noscript><link rel="stylesheet" href="/_astro/test.css">');
    expect(readFileSync(path.join(dist, '_astro', 'test.css'), 'utf8')).toContain('.unused');
  });
});
