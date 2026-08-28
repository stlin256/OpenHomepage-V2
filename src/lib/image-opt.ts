/** Page image optimization helpers shared by the post-build WebP/AVIF pass. */

export const CONVERTIBLE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
export const RESPONSIVE_WEBP_WIDTHS = [480, 768, 1024, 1440, 1920, 2560] as const;

const EXT_RE = /(\.[a-z0-9]+)((?:\?|#).*)?$/i;
const ASSETS_URL_RE = /(^|\/)assets\//;

export function isConvertibleAssetPath(assetPath: string): boolean {
  if (!assetPath.startsWith('assets/')) return false;
  const match = EXT_RE.exec(assetPath);
  if (!match) return false;
  if (!CONVERTIBLE_EXTENSIONS.has(match[1].toLowerCase())) return false;
  return !assetPath.slice(0, match.index).endsWith('-full') && !isGeneratedResponsiveVariant(assetPath);
}

function isGeneratedResponsiveVariant(assetPath: string): boolean {
  const match = /\.(\d+)\.webp$/i.exec(assetPath);
  return match != null && (RESPONSIVE_WEBP_WIDTHS as readonly number[]).includes(Number(match[1]));
}

export function webpAssetPath(assetPath: string): string | null {
  if (!isConvertibleAssetPath(assetPath)) return null;
  const match = EXT_RE.exec(assetPath);
  if (!match) return null;
  return `${assetPath.slice(0, match.index)}.webp${match[2] ?? ''}`;
}

export function responsiveWebpAssetPath(assetPath: string, width: number): string | null {
  if (!isConvertibleAssetPath(assetPath)) return null;
  const match = EXT_RE.exec(assetPath);
  if (!match || !Number.isInteger(width) || width <= 0) return null;
  return `${assetPath.slice(0, match.index)}.${width}.webp${match[2] ?? ''}`;
}

export function avifAssetPath(assetPath: string): string | null {
  if (!isConvertibleAssetPath(assetPath)) return null;
  const match = EXT_RE.exec(assetPath);
  if (!match) return null;
  return `${assetPath.slice(0, match.index)}.avif${match[2] ?? ''}`;
}

export function responsiveAvifAssetPath(assetPath: string, width: number): string | null {
  if (!isConvertibleAssetPath(assetPath)) return null;
  const match = EXT_RE.exec(assetPath);
  if (!match || !Number.isInteger(width) || width <= 0) return null;
  return `${assetPath.slice(0, match.index)}.${width}.avif${match[2] ?? ''}`;
}

interface LocalAssetUrl {
  assetPath: string;
  prefix: string;
  searchAndHash: string;
}

function parseLocalAssetUrl(imageUrl: string): LocalAssetUrl | null {
  if (!imageUrl || /^(https?:|data:|blob:|\/\/)/i.test(imageUrl)) return null;

  let pathname: string;
  let searchAndHash = '';
  try {
    const url = new URL(imageUrl, 'https://image.invalid/');
    pathname = url.pathname;
    searchAndHash = `${url.search}${url.hash}`;
  } catch {
    return null;
  }

  const marker = pathname.lastIndexOf('/assets/');
  if (marker < 0 || !ASSETS_URL_RE.test(pathname)) return null;
  let assetPath = pathname.slice(marker + '/assets/'.length);
  try {
    assetPath = decodeURIComponent(assetPath);
  } catch {
    return null;
  }
  return { assetPath, prefix: pathname.slice(0, marker + '/assets/'.length), searchAndHash };
}

export function localAssetPathFromImageUrl(imageUrl: string): string | null {
  return parseLocalAssetUrl(imageUrl)?.assetPath ?? null;
}

function encodedAssetUrl(assetPath: string, local: LocalAssetUrl): string {
  return `${local.prefix}${assetPath
    .slice('assets/'.length)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}${local.searchAndHash}`;
}

/**
 * Resolve an image URL against the set of WebP files produced in dist/assets.
 * The site may be deployed below a base path, so assets/ is found as a path segment.
 */
export function webpImageUrl(
  imageUrl: string,
  availableWebp: ReadonlySet<string>,
): string | null {
  const local = parseLocalAssetUrl(imageUrl);
  if (!local) return null;
  const replacement = webpAssetPath(`assets/${local.assetPath}`);
  if (!replacement || !availableWebp.has(replacement)) return null;
  return encodedAssetUrl(replacement, local);
}

export function responsiveWebpImageUrl(
  imageUrl: string,
  width: number,
  availableWebp: ReadonlySet<string>,
): string | null {
  const local = parseLocalAssetUrl(imageUrl);
  if (!local) return null;
  const replacement = responsiveWebpAssetPath(`assets/${local.assetPath}`, width);
  if (!replacement || !availableWebp.has(replacement)) return null;
  return encodedAssetUrl(replacement, local);
}

/** Same resolution rules as the WebP helpers, against the AVIF output set. */
export function avifImageUrl(
  imageUrl: string,
  availableAvif: ReadonlySet<string>,
): string | null {
  const local = parseLocalAssetUrl(imageUrl);
  if (!local) return null;
  const replacement = avifAssetPath(`assets/${local.assetPath}`);
  if (!replacement || !availableAvif.has(replacement)) return null;
  return encodedAssetUrl(replacement, local);
}

export function responsiveAvifImageUrl(
  imageUrl: string,
  width: number,
  availableAvif: ReadonlySet<string>,
): string | null {
  const local = parseLocalAssetUrl(imageUrl);
  if (!local) return null;
  const replacement = responsiveAvifAssetPath(`assets/${local.assetPath}`, width);
  if (!replacement || !availableAvif.has(replacement)) return null;
  return encodedAssetUrl(replacement, local);
}

/**
 * Infer source sizes from the site's stable layout rules. Explicit media
 * queries let the browser choose candidates before stylesheet load and let
 * detached pre-loading images select the same file as the rendered page.
 */
export function inferImageSizes(element: Element): string {
  if (element.hasAttribute('sizes')) return element.getAttribute('sizes') ?? '100vw';
  if (element.closest('.intro-qr')) return '72px';
  if (element.closest('.qr-modal-image')) return '176px';
  if (element.closest('.rss-cover')) return '(max-width: 768px) 76.8px, 88px';
  if (element.closest('.profile-top')) return '(max-width: 768px) 96px, 92px';
  if (element.closest('.profile-avatar')) return '(max-width: 768px) 140px, 150px';

  const figure = element.closest('figure');
  const widthStyle =
    figure?.getAttribute('style')?.match(/(?:^|;)\s*width:\s*([\d.]+)(%|px|rem|em|vw)\s*(?:;|$)/i) ??
    element.getAttribute('style')?.match(/(?:^|;)\s*width:\s*([\d.]+)(%|px|rem|em|vw)\s*(?:;|$)/i);
  const widthAttr = Number(element.getAttribute('width') ?? '');
  if (Number.isFinite(widthAttr) && widthAttr > 0) return `${widthAttr}px`;
  if (widthStyle && widthStyle[2] !== '%') return `${widthStyle[1]}${widthStyle[2]}`;

  const factor =
    widthStyle?.[2] === '%' ? Math.max(0.01, Math.min(1, Number(widthStyle[1]) / 100)) : 1;
  const grid = element.closest('.md-grid');
  const columns = Math.max(
    1,
    Math.min(12, Number(grid?.getAttribute('style')?.match(/repeat\((\d+)/i)?.[1] ?? '1')),
  );
  const gap = grid && columns > 1 ? 24 * (columns - 1) : 0;
  const suffix = columns > 1 ? ` - ${gap}px` : '';
  const columnWidth = (available: string) =>
    columns === 1 ? available : `calc((${available}${suffix}) / ${columns})`;
  // 内容宽 = min(100vw - 侧边导航 176px, 68rem) - .site-main 两侧各 2rem；
  // ≤768px 无侧边导航，且 md-grid 媒体查询收敛为单列，始终占满内容宽。
  const full = 'calc(100vw - 64px)';
  const desktop = columnWidth(columns === 1 ? 'calc(100vw - 240px)' : '100vw - 240px');
  const wide = columnWidth('1024px');
  const scale = (value: string) => (factor === 1 ? value : `calc((${value}) * ${factor})`);
  return [
    `(max-width: 768px) ${scale(full)}`,
    `(max-width: 1264px) ${scale(desktop)}`,
    scale(wide),
  ].join(', ');
}
