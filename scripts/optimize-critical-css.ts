/**
 * Inline route critical CSS and lazy-load the full stylesheet.
 *
 * Beasties evaluates the generated DOM without a browser, so we explicitly
 * preserve dark-theme rules and the global reduced-motion fallback. The full
 * stylesheet remains cached and is swapped in by its preload onload handler.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Beasties from 'beasties';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walkFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function publicPathFor(html: string): string {
  const match = /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/.exec(html);
  if (!match) return '/';
  const index = match[1].indexOf('/_astro/');
  return index > 0 ? match[1].slice(0, index) : '/';
}

export async function optimizeCriticalCss(distDir = path.join(rootDir, 'dist')): Promise<{ pages: number; criticalBytes: number }> {
  const htmlFiles = statSync(distDir, { throwIfNoEntry: false })?.isDirectory()
    ? walkFiles(distDir).filter((file) => file.endsWith('.html'))
    : [];
  let criticalBytes = 0;

  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf8');
    const beasties = new Beasties({
      path: distDir,
      publicPath: publicPathFor(html),
      external: true,
      preload: 'swap',
      noscriptFallback: true,
      inlineFonts: true,
      preloadFonts: false,
      keyframes: 'critical',
      compress: true,
      safeParser: true,
      logLevel: 'warn',
      allowRules: [/^html\[data-theme=["']?dark["']?\]/],
    });

    let output = await beasties.process(html);
    output = output.replace(/\sdata-beasties-container(?=[\s>])/g, '');
    const styleMatch = /<style>([\s\S]*?)<\/style>/.exec(output);
    if (styleMatch) criticalBytes += Buffer.byteLength(styleMatch[1], 'utf8');
    if (output !== html) writeFileSync(file, output, 'utf8');
  }

  return { pages: htmlFiles.length, criticalBytes };
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const result = await optimizeCriticalCss();
  console.log(
    `[optimize-critical-css] ${result.pages} pages, ${Math.round(result.criticalBytes / 1024)} KiB critical CSS`,
  );
}
