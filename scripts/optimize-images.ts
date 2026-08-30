/**
 * Post-build image pass: create responsive WebP + AVIF variants for ordinary
 * page images, then rewrite generated HTML references (AVIF via <picture>
 * sources with WebP <img> fallback). Original files and *-full variants
 * remain deployed for the lightbox and direct downloads.
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp, { type Metadata } from 'sharp';
import { JSDOM } from 'jsdom';
import {
  avifImageUrl,
  inferImageSizes,
  isConvertibleAssetPath,
  localAssetPathFromImageUrl,
  responsiveAvifImageUrl,
  responsiveWebpImageUrl,
  webpAssetPath,
  webpImageUrl,
} from '../src/lib/image-opt.ts';
import { parseImageSizes, responsiveWidthsForLayout, type ImageLayout } from '../src/lib/responsive-images.ts';

interface ConversionResult {
  converted: number;
  reused: number;
  variantsCreated: number;
  variantsReused: number;
  avifConverted: number;
  avifReused: number;
  avifVariantsCreated: number;
  avifVariantsReused: number;
  bytesSaved: number;
  cacheHits: number;
  rewrittenReferences: number;
}

interface ResponsiveImage {
  naturalWidth: number;
  naturalHeight: number;
  variantWidths: number[];
}

type ResponsiveCatalog = Map<string, ResponsiveImage>;

interface ImageOptSourceMetadata {
  path: string;
  sha256: string;
  bytes: number;
  format: string | null;
  width: number;
  height: number;
  orientation: number;
  pages: number;
}

interface ImageOptAlgorithmMetadata {
  library: 'sharp';
  format: 'webp' | 'avif';
  quality: number;
  effort: number;
  rotate: true;
  resize: 'without-enlargement';
  sharpVersion: string;
  libvipsVersion: string;
  codecVersion: string;
}

interface ImageOptOutputMetadata {
  path: string;
  sha256: string;
  bytes: number;
}

interface ImageOptManifestEntry {
  source: ImageOptSourceMetadata;
  algorithm: ImageOptAlgorithmMetadata;
  output: ImageOptOutputMetadata;
}

interface ImageOptManifest {
  schemaVersion: 1;
  entries: Record<string, ImageOptManifestEntry>;
}

interface OptimizeOptions {
  /** 上一次部署的 dist 目录；GitHub Actions 中为 gh-pages checkout。 */
  previousDistDir?: string;
}

const MANIFEST_NAME = 'image-opt-manifest.json';
const COMPRESSION_EFFORT = 4;
const EMPTY_MANIFEST: ImageOptManifest = { schemaVersion: 1, entries: {} };

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

function qualityFromEnv(value: number, fallback = 80): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(1, Math.round(value))) : fallback;
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

function responsiveCandidateUrl(
  referenceUrl: string,
  width: number,
  naturalWidth: number,
  available: ReadonlySet<string>,
  format: 'webp' | 'avif',
): string | null {
  if (width >= naturalWidth) {
    return format === 'webp'
      ? webpImageUrl(referenceUrl, available)
      : avifImageUrl(referenceUrl, available);
  }
  return format === 'webp'
    ? responsiveWebpImageUrl(referenceUrl, width, available)
    : responsiveAvifImageUrl(referenceUrl, width, available);
}

function responsiveEntriesForLayout(maxWidth: number, naturalWidth: number): Array<{ width: number; descriptor: number }> {
  const byWidth = new Map<number, number>();
  for (const descriptor of [1, 2, 3]) {
    const width = Math.min(naturalWidth, Math.max(1, Math.round((maxWidth * descriptor) / 2) * 2));
    byWidth.set(width, Math.max(byWidth.get(width) ?? 0, descriptor));
  }
  return [...byWidth.entries()]
    .map(([width, descriptor]) => ({ width, descriptor }))
    .sort((a, b) => a.width - b.width);
}

function responsiveSrcsetForLayout(
  referenceUrl: string,
  image: ResponsiveImage,
  layout: ImageLayout,
  available: ReadonlySet<string>,
  format: 'webp' | 'avif',
): string | null {
  const entries = responsiveEntriesForLayout(layout.maxWidth, image.naturalWidth)
    .map(({ width, descriptor }) => {
      const url = responsiveCandidateUrl(referenceUrl, width, image.naturalWidth, available, format);
      return url ? `${url} ${descriptor}x` : null;
    })
    .filter((entry): entry is string => entry !== null);
  return entries.length > 0 ? entries.join(', ') : null;
}

function wrapWithResponsiveSources(
  document: Document,
  img: Element,
  referenceUrl: string,
  layouts: ImageLayout[],
  catalog: ResponsiveCatalog,
  availableWebp: ReadonlySet<string>,
  availableAvif: ReadonlySet<string>,
): void {
  const assetPath = localAssetPathFromImageUrl(referenceUrl);
  const basePath = assetPath ? webpAssetPath(`assets/${assetPath}`) : null;
  const image = basePath ? catalog.get(basePath) : undefined;
  if (!image) return;

  let picture = img.parentElement?.tagName === 'PICTURE' ? img.parentElement : null;
  if (!picture) {
    picture = document.createElement('picture');
    img.parentNode?.insertBefore(picture, img);
    picture.append(img);
  }

  for (const child of [...picture.children]) {
    if (child.tagName === 'SOURCE' && child.getAttribute('data-responsive-source') === '1') {
      child.remove();
    }
  }

  const sources: Element[] = [];
  for (const [type, available, format] of [
    ['image/avif', availableAvif, 'avif'],
    ['image/webp', availableWebp, 'webp'],
  ] as const) {
    for (const layout of layouts) {
      const srcset = responsiveSrcsetForLayout(referenceUrl, image, layout, available, format);
      if (!srcset) continue;
      const source = document.createElement('source');
      source.setAttribute('type', type);
      source.setAttribute('srcset', srcset);
      if (layout.media) source.setAttribute('media', layout.media);
      source.setAttribute('data-responsive-source', '1');
      sources.push(source);
    }
  }
  for (const source of sources.toReversed()) picture.prepend(source);

  const fallbackLayout = layouts.at(-1) ?? layouts[0];
  const fallback = responsiveSrcsetForLayout(referenceUrl, image, fallbackLayout, availableWebp, 'webp');
  if (fallback) img.setAttribute('srcset', fallback);
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

function rewriteHtml(
  html: string,
  catalog: ResponsiveCatalog,
  availableWebp: ReadonlySet<string>,
  availableAvif: ReadonlySet<string>,
): string {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  for (const element of document.querySelectorAll<HTMLElement>(
    'img[src], img[srcset], source[src], source[srcset], video[poster], [style]',
  )) {
    if (element.getAttribute('data-responsive-source') === '1') continue;
    const src = element.getAttribute('src');
    const srcset = element.getAttribute('srcset');
    const referenceUrl = src ?? (srcset ? firstSrcsetUrl(srcset) : null);

    if (element.tagName === 'IMG' && referenceUrl) {
      if (!element.hasAttribute('sizes')) element.setAttribute('sizes', inferImageSizes(element));
    }

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

    if (
      element.tagName === 'IMG' &&
      referenceUrl &&
      !element.hasAttribute('width') &&
      !element.hasAttribute('height')
    ) {
      const assetPath = localAssetPathFromImageUrl(referenceUrl);
      const basePath = assetPath ? webpAssetPath(`assets/${assetPath}`) : null;
      const image = basePath ? catalog.get(basePath) : undefined;
      if (image && image.naturalHeight > 0) {
        element.setAttribute('width', String(image.naturalWidth));
        element.setAttribute('height', String(image.naturalHeight));
      }
    }

    if (element.tagName === 'IMG' && referenceUrl) {
      const sizes = element.getAttribute('sizes') ?? inferImageSizes(element);
      wrapWithResponsiveSources(
        document,
        element,
        referenceUrl,
        parseImageSizes(sizes),
        catalog,
        availableWebp,
        availableAvif,
      );
    }
  }

  return dom.serialize();
}

function collectRequiredVariantWidths(htmlFiles: string[]): Map<string, number[]> {
  const required = new Map<string, Set<number>>();
  for (const file of htmlFiles) {
    const dom = new JSDOM(readFileSync(file, 'utf8'));
    for (const img of dom.window.document.querySelectorAll<HTMLImageElement>('img[src], img[srcset]')) {
      const src = img.getAttribute('src');
      const srcset = img.getAttribute('srcset');
      const referenceUrl = src ?? (srcset ? firstSrcsetUrl(srcset) : null);
      const assetPath = referenceUrl ? localAssetPathFromImageUrl(referenceUrl) : null;
      const basePath = assetPath ? webpAssetPath(`assets/${assetPath}`) : null;
      if (!basePath) continue;
      const sizes = img.getAttribute('sizes') ?? inferImageSizes(img);
      const widths = required.get(basePath) ?? new Set<number>();
      for (const layout of parseImageSizes(sizes)) {
        for (const width of responsiveWidthsForLayout(layout.maxWidth, Number.MAX_SAFE_INTEGER)) {
          widths.add(width);
        }
      }
      required.set(basePath, widths);
    }
  }
  return new Map([...required].map(([key, widths]) => [key, [...widths].sort((a, b) => a - b)]));
}

async function validExistingVariant(file: string, expectedWidth: number): Promise<boolean> {
  const stat = statSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size === 0) return false;
  try {
    return (await sharp(readFileSync(file)).metadata()).width === expectedWidth;
  } catch {
    return false;
  }
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function sourceMetadata(
  relative: string,
  source: Buffer,
  metadata: Metadata,
): ImageOptSourceMetadata {
  return {
    path: relative,
    sha256: sha256(source),
    bytes: source.length,
    format: metadata.format ?? null,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    orientation: metadata.orientation ?? 1,
    pages: metadata.pages ?? 1,
  };
}

function algorithmMetadata(
  format: 'webp' | 'avif',
  quality: number,
): ImageOptAlgorithmMetadata {
  const versions = sharp.versions as Record<string, string>;
  return {
    library: 'sharp',
    format,
    quality,
    effort: COMPRESSION_EFFORT,
    rotate: true,
    resize: 'without-enlargement',
    sharpVersion: versions.sharp ?? '',
    libvipsVersion: versions.vips ?? '',
    codecVersion: (format === 'webp' ? versions.webp : versions.aom) ?? '',
  };
}

function sameSourceMetadata(a: ImageOptSourceMetadata, b: ImageOptSourceMetadata): boolean {
  return (
    a.path === b.path &&
    a.sha256 === b.sha256 &&
    a.bytes === b.bytes &&
    a.format === b.format &&
    a.width === b.width &&
    a.height === b.height &&
    a.orientation === b.orientation &&
    a.pages === b.pages
  );
}

function sameAlgorithmMetadata(a: ImageOptAlgorithmMetadata, b: ImageOptAlgorithmMetadata): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function manifestEntryMatches(
  entry: ImageOptManifestEntry | undefined,
  source: ImageOptSourceMetadata,
  algorithm: ImageOptAlgorithmMetadata,
): entry is ImageOptManifestEntry {
  return Boolean(
    entry &&
      sameSourceMetadata(entry.source, source) &&
      sameAlgorithmMetadata(entry.algorithm, algorithm),
  );
}

function readManifest(dir: string): ImageOptManifest {
  try {
    const parsed = JSON.parse(readFileSync(path.join(dir, MANIFEST_NAME), 'utf8')) as ImageOptManifest;
    if (parsed?.schemaVersion !== 1 || typeof parsed.entries !== 'object' || parsed.entries === null) {
      return EMPTY_MANIFEST;
    }
    return parsed;
  } catch {
    return EMPTY_MANIFEST;
  }
}

function writeManifest(dir: string, entries: Map<string, ImageOptManifestEntry>): void {
  const sortedEntries = Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(
    path.join(dir, MANIFEST_NAME),
    `${JSON.stringify({ schemaVersion: 1, entries: sortedEntries }, null, 2)}\n`,
    'utf8',
  );
}

function verifiedOutput(root: string, entry: ImageOptManifestEntry): Buffer | null {
  const file = path.join(root, entry.output.path);
  const stat = statSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size !== entry.output.bytes) return null;
  try {
    const output = readFileSync(file);
    return output.length === entry.output.bytes && sha256(output) === entry.output.sha256 ? output : null;
  } catch {
    return null;
  }
}

interface OutputResult {
  output: Buffer;
  cacheHit: boolean;
  reusedExisting: boolean;
}

async function ensureOutput(options: {
  source: Buffer;
  sourceInfo: ImageOptSourceMetadata;
  algorithm: ImageOptAlgorithmMetadata;
  outputRelative: string;
  width: number;
  distDir: string;
  previousDistDir?: string;
  currentManifest: ImageOptManifest;
  previousManifest: ImageOptManifest;
  manifestEntries: Map<string, ImageOptManifestEntry>;
}): Promise<OutputResult> {
  const target = path.join(options.distDir, options.outputRelative);
  const currentEntry = options.currentManifest.entries[options.outputRelative];
  if (manifestEntryMatches(currentEntry, options.sourceInfo, options.algorithm)) {
    const output = verifiedOutput(options.distDir, currentEntry);
    if (output) {
      options.manifestEntries.set(options.outputRelative, currentEntry);
      return { output, cacheHit: true, reusedExisting: false };
    }
  }

  if (options.previousDistDir) {
    const previousEntry = options.previousManifest.entries[options.outputRelative];
    if (manifestEntryMatches(previousEntry, options.sourceInfo, options.algorithm)) {
      const output = verifiedOutput(options.previousDistDir, previousEntry);
      if (output) {
        mkdirSync(path.dirname(target), { recursive: true });
        copyFileSync(path.join(options.previousDistDir, options.outputRelative), target);
        options.manifestEntries.set(options.outputRelative, previousEntry);
        return { output, cacheHit: true, reusedExisting: false };
      }
    }
  }

  // 兼容尚未生成 manifest 的旧 dist：仍按宽度校验既有产物，并在本次补写元数据。
  if (
    !currentEntry &&
    !options.previousManifest.entries[options.outputRelative] &&
    (await validExistingVariant(target, options.width))
  ) {
    const output = readFileSync(target);
    options.manifestEntries.set(options.outputRelative, {
      source: options.sourceInfo,
      algorithm: options.algorithm,
      output: { path: options.outputRelative, sha256: sha256(output), bytes: output.length },
    });
    return { output, cacheHit: false, reusedExisting: true };
  }

  const output =
    options.algorithm.format === 'webp'
      ? await writeWebp(options.source, target, options.width, options.algorithm.quality)
      : await writeAvif(options.source, target, options.width, options.algorithm.quality);
  options.manifestEntries.set(options.outputRelative, {
    source: options.sourceInfo,
    algorithm: options.algorithm,
    output: { path: options.outputRelative, sha256: sha256(output), bytes: output.length },
  });
  return { output, cacheHit: false, reusedExisting: false };
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
    .webp({ quality, effort: COMPRESSION_EFFORT })
    .toBuffer();
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, output);
  return output;
}

// AVIF 压缩效率更高：q50 观感约等于 WebP q80，体积再小 30–50%
async function writeAvif(
  source: Buffer,
  target: string,
  width: number,
  quality: number,
): Promise<Buffer> {
  const output = await sharp(source)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .avif({ quality, effort: COMPRESSION_EFFORT })
    .toBuffer();
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, output);
  return output;
}

export async function optimizeDistImages(
  distDir: string,
  quality = qualityFromEnv(Number(process.env.WEBP_QUALITY ?? 80)),
  avifQuality = qualityFromEnv(Number(process.env.AVIF_QUALITY ?? 50), 50),
  options: OptimizeOptions = {},
): Promise<ConversionResult> {
  const assetsDir = path.join(distDir, 'assets');
  const previousDistDir = options.previousDistDir ? path.resolve(options.previousDistDir) : undefined;
  const currentManifest = readManifest(distDir);
  const previousManifest = previousDistDir ? readManifest(previousDistDir) : EMPTY_MANIFEST;
  const manifestEntries = new Map<string, ImageOptManifestEntry>();
  const availableWebp = new Set<string>();
  const availableAvif = new Set<string>();
  const catalog: ResponsiveCatalog = new Map();
  let converted = 0;
  let reused = 0;
  let variantsCreated = 0;
  let variantsReused = 0;
  let avifConverted = 0;
  let avifReused = 0;
  let avifVariantsCreated = 0;
  let avifVariantsReused = 0;
  let bytesSaved = 0;
  let cacheHits = 0;

  const files = statSync(assetsDir, { throwIfNoEntry: false })?.isDirectory()
    ? walkFiles(assetsDir)
    : [];
  const htmlFiles = walkFiles(distDir).filter((file) => file.endsWith('.html'));
  const requiredVariantWidths = collectRequiredVariantWidths(htmlFiles);
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
    const nonWebpSourceCount = stemCounts.get(stem) ?? 0;
    // Repeat runs leave a generated base WebP beside its JPG/PNG source.
    // That WebP is an output, not a second source; processing it would overwrite
    // the manifest entry and prevent the next fresh build from reusing it.
    if (/\.webp$/i.test(relative) && nonWebpSourceCount > 0) continue;
    if (nonWebpSourceCount > 1) {
      console.warn(`[optimize-images] skipped ambiguous stem ${stem}: multiple source formats`);
      continue;
    }

    try {
      const source = readFileSync(file);
      const metadata = await sharp(source).metadata();
      let naturalWidth = metadata.width ?? 0;
      let naturalHeight = metadata.height ?? 0;
      // 转换时 .rotate() 按 EXIF 方向转正，90/270 度的图宽高互换，占位需与产物一致
      if (metadata.orientation != null && metadata.orientation >= 5) {
        [naturalWidth, naturalHeight] = [naturalHeight, naturalWidth];
      }
      if (!naturalWidth) continue;

      const sourceInfo = sourceMetadata(relative, source, metadata);
      const isWebpSource = /\.webp$/i.test(file);
      const avifRelative = relative.replace(/\.[a-z0-9]+$/i, '.avif');
      const conversionTasks: Array<Promise<void>> = [];
      const sourceManifestEntries = new Map<string, ImageOptManifestEntry>();
      const ensureOutputArgs = {
        source,
        sourceInfo,
        distDir,
        previousDistDir,
        currentManifest,
        previousManifest,
        manifestEntries: sourceManifestEntries,
      };

      conversionTasks.push((async () => {
        const result = await ensureOutput({
          ...ensureOutputArgs,
          algorithm: algorithmMetadata('webp', quality),
          outputRelative: `assets/${webpRelative}`,
          width: naturalWidth,
        });
        if (result.cacheHit) {
          reused += 1;
          cacheHits += 1;
        } else if (result.reusedExisting) {
          reused += 1;
        } else {
          converted += 1;
          if (!isWebpSource) bytesSaved += Math.max(0, source.length - result.output.length);
        }
        availableWebp.add(`assets/${webpRelative}`);
      })());

      conversionTasks.push((async () => {
        const result = await ensureOutput({
          ...ensureOutputArgs,
          algorithm: algorithmMetadata('avif', avifQuality),
          outputRelative: `assets/${avifRelative}`,
          width: naturalWidth,
        });
        if (result.cacheHit) {
          avifReused += 1;
          cacheHits += 1;
        } else if (result.reusedExisting) {
          avifReused += 1;
        } else {
          avifConverted += 1;
          bytesSaved += Math.max(0, source.length - result.output.length);
        }
        availableAvif.add(`assets/${avifRelative}`);
      })());

      const variantWidths: number[] = [];
      if (!metadata.pages || metadata.pages <= 1) {
        const requiredWidths = requiredVariantWidths.get(`assets/${webpRelative}`) ?? [];
        for (const width of requiredWidths) {
          if (width >= naturalWidth) continue;
          const webpVariantRelative = responsiveWebpRelativePath(webpRelative, width);
          const avifVariantRelative = responsiveAvifRelativePath(avifRelative, width);
          conversionTasks.push((async () => {
            await Promise.all([
              (async () => {
                const result = await ensureOutput({
                  ...ensureOutputArgs,
                  algorithm: algorithmMetadata('webp', quality),
                  outputRelative: `assets/${webpVariantRelative}`,
                  width,
                });
                if (result.cacheHit) {
                  variantsReused += 1;
                  cacheHits += 1;
                } else if (result.reusedExisting) {
                  variantsReused += 1;
                } else {
                  variantsCreated += 1;
                  bytesSaved += Math.max(0, source.length - result.output.length);
                }
                availableWebp.add(`assets/${webpVariantRelative}`);
              })(),
              (async () => {
                const result = await ensureOutput({
                  ...ensureOutputArgs,
                  algorithm: algorithmMetadata('avif', avifQuality),
                  outputRelative: `assets/${avifVariantRelative}`,
                  width,
                });
                if (result.cacheHit) {
                  avifVariantsReused += 1;
                  cacheHits += 1;
                } else if (result.reusedExisting) {
                  avifVariantsReused += 1;
                } else {
                  avifVariantsCreated += 1;
                  bytesSaved += Math.max(0, source.length - result.output.length);
                }
                availableAvif.add(`assets/${avifVariantRelative}`);
              })(),
            ]);
            variantWidths.push(width);
          })());
        }
      }

      // 一张源图的所有输出互相独立；任一输出失败时，先等同批任务结束，
      // 再像旧流程一样跳过整张图，避免半成品引用进入 HTML。
      const settled = await Promise.allSettled(conversionTasks);
      const failed = settled.find((entry) => entry.status === 'rejected');
      if (failed && failed.status === 'rejected') throw failed.reason;
      for (const [key, value] of sourceManifestEntries) manifestEntries.set(key, value);
      catalog.set(`assets/${webpRelative}`, { naturalWidth, naturalHeight, variantWidths });
    } catch (error) {
      console.warn(`[optimize-images] skipped ${relative}: ${(error as Error).message}`);
    }
  }

  writeManifest(distDir, manifestEntries);

  let rewrittenReferences = 0;
  if (availableWebp.size > 0) {
    for (const file of walkFiles(distDir)) {
      if (!file.endsWith('.html')) continue;
      const html = readFileSync(file, 'utf8');
      const rewritten = rewriteHtml(html, catalog, availableWebp, availableAvif);
      if (rewritten !== html) {
        writeFileSync(file, rewritten, 'utf8');
        rewrittenReferences += 1;
      }
    }
  }

  return {
    converted,
    reused,
    variantsCreated,
    variantsReused,
    avifConverted,
    avifReused,
    avifVariantsCreated,
    avifVariantsReused,
    bytesSaved,
    cacheHits,
    rewrittenReferences,
  };
}
function responsiveWebpRelativePath(webpRelative: string, width: number): string {
  return webpRelative.replace(/\.webp$/i, `.${width}.webp`);
}

function responsiveAvifRelativePath(avifRelative: string, width: number): string {
  return avifRelative.replace(/\.avif$/i, `.${width}.avif`);
}

async function main(): Promise<void> {
  const distDir = path.resolve(process.argv[2] ?? 'dist');
  const previousDistDir = process.env.IMAGE_OPT_PREVIOUS_DIST;
  const result = await optimizeDistImages(
    distDir,
    undefined,
    undefined,
    previousDistDir ? { previousDistDir: path.resolve(previousDistDir) } : undefined,
  );
  console.log(
    `[optimize-images] WebP: ${result.converted} converted, ${result.reused} already present, ` +
      `${result.variantsCreated} responsive variants created, ${result.variantsReused} reused, ` +
      `AVIF: ${result.avifConverted} converted, ${result.avifReused} already present, ` +
      `${result.avifVariantsCreated} responsive variants created, ${result.avifVariantsReused} reused, ` +
      `${result.cacheHits} metadata cache hits, ` +
      `${(result.bytesSaved / 1024).toFixed(1)} KiB saved, ${result.rewrittenReferences} HTML files rewritten`,
  );
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) await main();
