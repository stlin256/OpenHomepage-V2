/** Page image optimization helpers shared by the post-build WebP pass. */

export const CONVERTIBLE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

const EXT_RE = /(\.[a-z0-9]+)((?:\?|#).*)?$/i;
const ASSETS_URL_RE = /(^|\/)assets\//;

export function isConvertibleAssetPath(assetPath: string): boolean {
  if (!assetPath.startsWith('assets/')) return false;
  const match = EXT_RE.exec(assetPath);
  if (!match) return false;
  if (!CONVERTIBLE_EXTENSIONS.has(match[1].toLowerCase())) return false;
  return !assetPath.slice(0, match.index).endsWith('-full');
}

export function webpAssetPath(assetPath: string): string | null {
  if (!isConvertibleAssetPath(assetPath)) return null;
  const match = EXT_RE.exec(assetPath);
  if (!match) return null;
  return `${assetPath.slice(0, match.index)}.webp${match[2] ?? ''}`;
}

/**
 * Resolve an image URL against the set of WebP files produced in dist/assets.
 * The site may be deployed below a base path, so assets/ is found as a path segment.
 */
export function webpImageUrl(
  imageUrl: string,
  availableWebp: ReadonlySet<string>,
): string | null {
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

  const replacement = webpAssetPath(`assets/${assetPath}`);
  if (!replacement || !availableWebp.has(replacement)) return null;
  const prefix = pathname.slice(0, marker + '/assets/'.length);
  return `${prefix}${replacement
    .slice('assets/'.length)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}${searchAndHash}`;
}
