/**
 * Shared helpers for parsing image layout sizes and choosing exact DPR candidates.
 */

export interface ImageLayout {
  media?: string;
  maxWidth: number;
}

const CALC_RE = /^calc\((.*)\)$/;

function viewportWidthForMedia(media?: string): number {
  if (!media) return 1280;
  const match = /max-width:\s*([\d.]+)px/i.exec(media);
  if (match) return Number(match[1]);
  return 1440;
}

function estimateSizeWidth(size: string, media?: string): number {
  const viewport = viewportWidthForMedia(media);
  const directPx = /^([\d.]+)px$/i.exec(size.trim());
  if (directPx) return Number(directPx[1]);

  const directVw = /^([\d.]+)vw$/i.exec(size.trim());
  if (directVw) return (viewport * Number(directVw[1])) / 100;

  const calc = CALC_RE.exec(size.trim());
  if (!calc) return 1024;

  let expression = calc[1]
    .replace(/calc\(/gi, '(')
    .replace(/(\d+(?:\.\d+)?)vw/gi, (_match, value: string) => String((viewport * Number(value)) / 100))
    .replace(/(\d+(?:\.\d+)?)px/gi, '$1')
    .replace(/px/gi, '');
  expression = expression.replace(/\s+/g, '');
  if (!/^[0-9+\-*/().]+$/.test(expression)) return 1024;

  try {
    // The expression above is restricted to numbers and arithmetic operators.
    const value = Function(`return (${expression});`)() as number;
    return Number.isFinite(value) && value > 0 ? value : 1024;
  } catch {
    return 1024;
  }
}

export function parseImageSizes(sizes: string): ImageLayout[] {
  const layouts: ImageLayout[] = [];
  for (const part of sizes.split(',')) {
    const value = part.trim();
    if (!value) continue;
    const match = /^(\([^)]+\))\s+(.+)$/.exec(value);
    const media = match?.[1];
    const size = match?.[2] ?? value;
    const width = Math.ceil(estimateSizeWidth(size, media));
    if (width > 0) layouts.push(media ? { media, maxWidth: width } : { maxWidth: width });
  }
  return layouts.length > 0 ? layouts : [{ maxWidth: 1024 }];
}

export function responsiveWidthsForLayout(maxWidth: number, naturalWidth: number): number[] {
  const targets = [maxWidth, maxWidth * 2, maxWidth * 3].map((width) =>
    Math.min(naturalWidth, Math.max(1, Math.round(width / 2) * 2)),
  );
  return [...new Set(targets)].sort((a, b) => a - b);
}

export function chooseResponsiveCandidate(
  srcset: string,
  devicePixelRatio: number,
): { src: string; descriptor: number } | null {
  const candidates = srcset
    .split(/,\s*/)
    .map((candidate) => {
      const match = /^(\S+)(?:\s+([0-9.]+)x)?$/.exec(candidate.trim());
      if (!match) return null;
      return { src: match[1], descriptor: match[2] ? Number(match[2]) : 1 };
    })
    .filter((candidate): candidate is { src: string; descriptor: number } => candidate !== null)
    .sort((a, b) => a.descriptor - b.descriptor);
  if (candidates.length === 0) return null;

  const exact = candidates.find((candidate) => candidate.descriptor >= devicePixelRatio);
  return exact ?? candidates[candidates.length - 1];
}
