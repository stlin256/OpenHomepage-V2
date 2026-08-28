/**
 * Post-build image pass: create responsive WebP variants for ordinary page
 * images, then rewrite generated HTML references. Original files and *-full
 * variants remain deployed for the lightbox and direct downloads.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { JSDOM } from 'jsdom';
import {
  RESPONSIVE_WEBP_WIDTHS,
  inferImageSizes,
  isConvertibleAssetPath,
  localAssetPathFromImageUrl,
  responsiveWebpImageUrl,
  webpAssetPath,
  webpImageUrl,
} from '../src/lib/image-opt.ts';

interface ConversionResult {
  converted: number;
  reused: number;
  variantsCreated: number;
  variantsReused: number;
  bytesSaved: number;
  rewrittenReferences: number;
}

interface ResponsiveImage {
  naturalWidth: number;
  variantWidths: number[];
}

type ResponsiveCatalog = Map<string, ResponsiveImage>;

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

function firstSrcsetUrl(value: string): string | null {
  return /^(\S+)/.exec(value.trim())?.[1] ?? null;
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

function responsiveSrcset(
  referenceUrl: string,
  catalog: ResponsiveCatalog,
  availableWebp: ReadonlySet<string>,
): string | null {
  const assetPath = localAssetPathFromImageUrl(referenceUrl);
  const basePath = assetPath ? webpAssetPath(`assets/${assetPath}`) : null;
  const image = basePath ? catalog.get(basePath) : undefined;
  if (!image) return null;

  const candidates = [...image.variantWidths, image.naturalWidth].sort((a, b) => a - b);
  const entries: string[] = [];
  for (const width of candidates) {
    const url =
      width === image.naturalWidth
        ? webpImageUrl(referenceUrl, availableWebp)
        : responsiveWebpImageUrl(referenceUrl, width, availableWebp);
    if (url) entries.push(`${url} ${width}w`);
  }
  return entries.length > 1 ? entries.join(', ') : null;
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

function rewriteHtml(html: string, catalog: ResponsiveCatalog, availableWebp: ReadonlySet<string>): string {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  for (const element of document.querySelectorAll<HTMLElement>(
    'img[src], img[srcset], source[src], source[srcset], video[poster], [style]',
  )) {
    const src = element.getAttribute('src');
    const srcset = element.getAttribute('srcset');
    const referenceUrl = src ?? (srcset ? firstSrcsetUrl(srcset) : null);
    const responsive = referenceUrl ? responsiveSrcset(referenceUrl, catalog, availableWebp) : null;

    for (const attr of ['src', 'poster', 'srcset'] as const) {
      const value = element.getAttribute(attr);
      if (!value) continue;
      if (responsive && attr === 'srcset') {
        element.setAttribute('srcset', responsive);
        if (!element.hasAttribute('sizes')) element.setAttribute('sizes', inferImageSizes(element));
        continue;
      }

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

    if (responsive && element.tagName === 'IMG' && src && webpImageUrl(src, availableWebp)) {
      element.setAttribute('src', webpImageUrl(src, availableWebp)!);
      // 只有 src 的普通图片同样补全 srcset，响应式档位才真正生效
      if (!element.hasAttribute('srcset')) element.setAttribute('srcset', responsive);
      if (!element.hasAttribute('sizes')) element.setAttribute('sizes', inferImageSizes(element));
    }

    const style = element.getAttribute('style');
    if (style) {
      const replacement = rewriteStyle(style, availableWebp);
      if (replacement) element.setAttribute('style', replacement);
    }
  }

  return dom.serialize();
}

async function validExistingWebp(file: string, expectedWidth: number): Promise<boolean> {
  const stat = statSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size === 0) return false;
  try {
    return (await sharp(readFileSync(file)).metadata()).width === expectedWidth;
  } catch {
    return false;
  }
}

async function writeWebp(
  source: Buffer,
  target: string,
  width: number,
  quality: number,
): Promise<Buffer> {
  const output = await sharp(source)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toBuffer();
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, output);
  return output;
}

export async function optimizeDistImages(
  distDir: string,
  quality = qualityFromEnv(Number(process.env.WEBP_QUALITY ?? 80)),
): Promise<ConversionResult> {
  const assetsDir = path.join(distDir, 'assets');
  const availableWebp = new Set<string>();
  const catalog: ResponsiveCatalog = new Map();
  let converted = 0;
  let reused = 0;
  let variantsCreated = 0;
  let variantsReused = 0;
  let bytesSaved = 0;

  const files = statSync(assetsDir, { throwIfNoEntry: false })?.isDirectory()
    ? walkFiles(assetsDir)
    : [];
  const convertibleFiles = files.filter((file) =>
    isConvertibleAssetPath(`assets/${toPosix(path.relative(assetsDir, file))}`),
  );
  const stemCounts = new Map<string, number>();
  for (const file of convertibleFiles) {
    // A generated base WebP can coexist with its JPG/PNG source on repeat
    // runs. Only two different non-WebP sources are truly ambiguous.
    if (/\.webp$/i.test(file)) continue;
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

    try {
      const source = readFileSync(file);
      const metadata = await sharp(source).metadata();
      const naturalWidth = metadata.width ?? 0;
      if (!naturalWidth) continue;

      const webpFile = path.join(assetsDir, webpRelative);
      const isWebpSource = /\.webp$/i.test(relative);
      if (isWebpSource) {
        if (!(await validExistingWebp(webpFile, naturalWidth))) {
          await writeWebp(source, webpFile, naturalWidth, quality);
          converted += 1;
        } else {
          reused += 1;
        }
      } else if (await validExistingWebp(webpFile, naturalWidth)) {
        reused += 1;
      } else {
        const output = await writeWebp(source, webpFile, naturalWidth, quality);
        converted += 1;
        bytesSaved += Math.max(0, source.length - output.length);
      }
      availableWebp.add(`assets/${webpRelative}`);

      const variantWidths: number[] = [];
      if (!metadata.pages || metadata.pages <= 1) {
        for (const width of RESPONSIVE_WEBP_WIDTHS) {
          if (width >= naturalWidth) continue;
          const variantRelative = responsiveWebpRelativePath(webpRelative, width);
          const variantFile = path.join(assetsDir, variantRelative);
          if (await validExistingWebp(variantFile, width)) {
            variantsReused += 1;
          } else {
            const output = await writeWebp(source, variantFile, width, quality);
            variantsCreated += 1;
            bytesSaved += Math.max(0, source.length - output.length);
          }
          availableWebp.add(`assets/${variantRelative}`);
          variantWidths.push(width);
        }
      }
      catalog.set(`assets/${webpRelative}`, { naturalWidth, variantWidths });
    } catch (error) {
      console.warn(`[optimize-images] skipped ${relative}: ${(error as Error).message}`);
    }
  }

  let rewrittenReferences = 0;
  if (availableWebp.size > 0) {
    for (const file of walkFiles(distDir)) {
      if (!file.endsWith('.html')) continue;
      const html = readFileSync(file, 'utf8');
      const rewritten = rewriteHtml(html, catalog, availableWebp);
      if (rewritten !== html) {
        writeFileSync(file, rewritten, 'utf8');
        rewrittenReferences += 1;
      }
    }
  }

  return { converted, reused, variantsCreated, variantsReused, bytesSaved, rewrittenReferences };
}

function responsiveWebpRelativePath(webpRelative: string, width: number): string {
  return webpRelative.replace(/\.webp$/i, `.${width}.webp`);
}

async function main(): Promise<void> {
  const distDir = path.resolve(process.argv[2] ?? 'dist');
  const result = await optimizeDistImages(distDir);
  console.log(
    `[optimize-images] WebP: ${result.converted} converted, ${result.reused} already present, ` +
      `${result.variantsCreated} responsive variants created, ${result.variantsReused} reused, ` +
      `${(result.bytesSaved / 1024).toFixed(1)} KiB saved, ${result.rewrittenReferences} HTML files rewritten`,
  );
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) await main();
