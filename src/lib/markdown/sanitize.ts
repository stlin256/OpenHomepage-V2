/**
 * rehype-sanitize 白名单 schema 与 iframe 域名白名单：
 * 在 GitHub 默认基础上放行 KaTeX/Shiki/媒体标签与 class/style/data*。
 * 自原 src/lib/markdown.ts 拆分而来（纯搬移，不改实现）。
 */

import { defaultSchema } from 'rehype-sanitize';
import type { Schema } from 'hast-util-sanitize';

/** 允许内嵌 iframe 的域名前缀（官方播放器），其余 iframe 一律剔除 */
export const IFRAME_SRC_ALLOWLIST = [
  /^https:\/\/player\.bilibili\.com\//,
  /^https:\/\/([\w-]+\.)?youtube\.com\/embed\//,
  /^https:\/\/([\w-]+\.)?youtube-nocookie\.com\/embed\//,
];

/** KaTeX 输出的 MathML 标签与属性（渲染结果固定，全量放行） */
const MATH_ML_TAGS = [
  'math', 'semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn', 'mtext', 'mspace',
  'msup', 'msub', 'msubsup', 'mfrac', 'msqrt', 'mroot', 'mtable', 'mtr', 'mtd',
  'mstyle', 'munderover', 'mover', 'munder', 'mpadded', 'mphantom', 'menclose',
  'merror', 'mglyph', 'ms',
];
const MATH_ML_ATTRS = [
  'xmlns', 'display', 'mathvariant', 'encoding', 'stretchy', 'accent', 'lspace',
  'rspace', 'fence', 'separator', 'largeop', 'movablelimits', 'symmetric', 'maxsize',
  'minsize', 'columnalign', 'rowalign', 'columnspacing', 'rowspacing', 'width',
  'height', 'depth', 'scriptlevel', 'displaystyle', 'href',
];

/** 白名单 schema：在 GitHub 默认基础上放行 KaTeX/Shiki/媒体标签与 class/style/data* */
export function buildSanitizeSchema(): Schema {
  const attributes: NonNullable<Schema['attributes']> = {
    ...defaultSchema.attributes,
    // @shikijs/rehype 产物的属性键是属性名形态（class/tabindex），与 className/tabIndex 一并放行
    '*': [
      ...(defaultSchema.attributes?.['*'] ?? []),
      'className', 'class', 'tabindex', 'style', 'data*', 'loading', 'role',
      'ariaHidden', 'ariaLabel', 'ariaLabelledBy', 'ariaDescribedBy',
    ],
    iframe: ['src', 'width', 'height', 'allowFullScreen', 'loading', 'referrerPolicy', 'title'],
    video: ['src', 'poster', 'controls', 'preload', 'width', 'height'],
    audio: ['src', 'controls', 'preload'],
    a: [...(defaultSchema.attributes?.a ?? ['href']), 'target', 'rel'],
    img: [...(defaultSchema.attributes?.img ?? ['src', 'alt', 'title']), 'loading', 'decoding', 'sizes', 'width', 'height', 'referrerPolicy', 'referrerpolicy'],
    button: ['type', 'ariaLabel', 'ariaPressed', 'disabled'],
    svg: ['viewBox', 'fill', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin', 'width', 'height', 'ariaHidden', 'ariaLabel', 'xmlns'],
    path: ['d', 'fill', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin'],
    polyline: ['points', 'fill', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin'],
    line: ['x1', 'y1', 'x2', 'y2', 'stroke', 'strokeWidth', 'strokeLinecap'],
    circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'strokeWidth'],
    rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'strokeWidth'],
  };
  for (const tag of MATH_ML_TAGS) attributes[tag] = MATH_ML_ATTRS;
  return {
    ...defaultSchema,
    clobberPrefix: '',
    tagNames: [
      ...(defaultSchema.tagNames ?? []),
      'iframe', 'video', 'audio', 'figure', 'figcaption', 'button', 'svg', 'path', 'polyline', 'line', 'circle', 'rect', 'aside', ...MATH_ML_TAGS,
    ],
    attributes,
  };
}
