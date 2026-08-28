/**
 * Post-build image pass: convert ordinary dist/assets raster images to WebP,
 * then rewrite generated HTML references. Original files and *-full variants
 * remain deployed for the lightbox and direct downloads.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { JSDOM } from 'jsdom';
import { isConvertibleAssetPath, webpImageUrl } from '../src/lib/image-opt.ts';

interface ConversionResult {
  converted: number;
  reused: number;
  bytesSaved: number;
  rewrittenReferences: number;
}

function walkFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

function qualityFromEnv(value: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(1, Math.round(value))) : 80;
}

function rewriteSrcset(value: string, availableWebp: ReadonlySet<string>): string | null {
  let changed = false;
  const rewritten = value
    .split(/,\s*/)
    .map((candidate) => {
      const match = /^(\S+)(.*)$/.exec(candidate.trim());
      if (!match) return candidate;
      const replacement = webpImageUrl(match[1], availableWebp);
      if (!replacement) return candidate;
      changed = true;
      return `${replacement}${match[2]}`;
    })
    .join(', ');
  return changed ? rewritten : null;
}

function rewriteStyle(value: string, availableWebp: ReadonlySet<string>): string | null {
  let changed = false;
  const rewritten = value.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/g,
    (match, quote: string, imageUrl: string) => {
      const replacement = webpImageUrl(imageUrl, availableWebp);
      if (!replacement) return match;
      changed = true;
      return `url(${quote}${replacement}${quote})`;
    },
  );
  return changed ? rewritten : null;
}

function rewriteHtml(html: string, availableWebp: ReadonlySet<string>): string {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  for (const element of document.querySelectorAll<HTMLElement>(
    'img[src], img[srcset], source[src], source[srcset], video[poster], [style]',
  )) {
    for (const attr of ['src', 'poster', 'srcset'] as const) {
      const value = element.getAttribute(attr);
      if (!value) continue;
      const replacement =
        attr === 'srcset'
          ? rewriteSrcset(value, availableWebp)
          : webpImageUrl(value, availableWebp);
      if (!replacement) continue;
      if (attr === 'src' && element.tagName === 'IMG' && !element.hasAttribute('data-original')) {
        element.setAttribute('data-original', value);
      }
      element.setAttribute(attr, replacement);
    }

    const style = element.getAttribute('style');
    if (style) {
      const replacement = rewriteStyle(style, availableWebp);
      if (replacement) element.setAttribute('style', replacement);
    }
  }

  return dom.serialize();
}

export async function optimizeDistImages(
  distDir: string,
  quality = qualityFromEnv(Number(process.env.WEBP_QUALITY ?? 80)),
): Promise<ConversionResult> {
  const assetsDir = path.join(distDir, 'assets');
  const availableWebp = new Set<string>();
  let converted = 0;
  let reused = 0;
  let bytesSaved = 0;

  const files = statSync(assetsDir, { throwIfNoEntry: false })?.isDirectory()
    ? walkFiles(assetsDir)
    : [];
  const convertibleFiles = files.filter((file) =>
    isConvertibleAssetPath(`assets/${toPosix(path.relative(assetsDir, file))}`),
  );
  const stemCounts = new Map<string, number>();
  for (const file of convertibleFiles) {
    const stem = toPosix(path.relative(assetsDir, file)).replace(/\.[a-z0-9]+$/i, '');
    stemCounts.set(stem, (stemCounts.get(stem) ?? 0) + 1);
  }

  for (const file of convertibleFiles) {
    const relative = toPosix(path.relative(assetsDir, file));
    const webpRelative = relative.replace(/\.[a-z0-9]+$/i, '.webp');
    const stem = relative.replace(/\.[a-z0-9]+$/i, '');
    if ((stemCounts.get(stem) ?? 0) > 1) {
      console.warn(`[optimize-images] skipped ambiguous stem ${stem}: multiple source formats`);
      continue;
    }

    const webpFile = path.join(assetsDir, webpRelative);
    const existing = statSync(webpFile, { throwIfNoEntry: false });
    if (existing?.isFile() && existing.size > 0) {
      availableWebp.add(`assets/${webpRelative}`);
      reused += 1;
      continue;
    }

    try {
      const source = readFileSync(file);
      const output = await sharp(source)
        .rotate()
        .webp({ quality, effort: 4 })
        .toBuffer();
      // A forced conversion can be larger than an already-efficient JPEG.
      // Keeping the original is faster in that case and still leaves a fallback.
      if (output.length >= source.length) continue;

      mkdirSync(path.dirname(webpFile), { recursive: true });
      writeFileSync(webpFile, output);
      availableWebp.add(`assets/${webpRelative}`);
      converted += 1;
      bytesSaved += source.length - output.length;
    } catch (error) {
      console.warn(`[optimize-images] skipped ${relative}: ${(error as Error).message}`);
    }
  }

  let rewrittenReferences = 0;
  if (availableWebp.size > 0) {
    for (const file of walkFiles(distDir)) {
      if (!file.endsWith('.html')) continue;
      const html = readFileSync(file, 'utf8');
      const rewritten = rewriteHtml(html, availableWebp);
      if (rewritten !== html) {
        writeFileSync(file, rewritten, 'utf8');
        rewrittenReferences += 1;
      }
    }
  }

  return { converted, reused, bytesSaved, rewrittenReferences };
}

async function main(): Promise<void> {
  const distDir = path.resolve(process.argv[2] ?? 'dist');
  const result = await optimizeDistImages(distDir);
  console.log(
    `[optimize-images] WebP: ${result.converted} converted, ${result.reused} already present, ` +
      `${(result.bytesSaved / 1024).toFixed(1)} KiB saved, ${result.rewrittenReferences} HTML files rewritten`,
  );
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) await main();
