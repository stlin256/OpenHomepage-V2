/**
 * markdown → HTML 渲染管线（门面）：纯函数式，不依赖 Astro 运行时，供构建期页面与单测复用。
 *
 * 能力：GFM、Shiki 明暗双主题代码高亮、KaTeX 数学公式、自定义指令
 * （bilibili/youtube/video/audio/figure/grid/cell/stream/ghcard，见 docs/specs/03）、
 * HTML 混写白名单过滤（剔除 script/事件属性/非白名单 iframe）。
 *
 * 实现已拆分至 src/lib/markdown/ 目录（types/utils/sanitize/embeds/directives/
 * edit-spans/decorations），本文件只做管线组装与公共 API re-export，
 * 对外 import 路径（src/lib/markdown.ts）保持不变。
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import rehypeShiki from '@shikijs/rehype';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { getBaseUrl } from './base-url.ts';
import { getUiLabels } from './ui-i18n.ts';
import { buildSanitizeSchema } from './markdown/sanitize.ts';
import { remarkCustomDirectives } from './markdown/directives.ts';
import { remarkEditSpans, rehypeStreamEmbeds, rehypeGhCards, rehypeEditorialEmbeds } from './markdown/edit-spans.ts';
import { rehypeResolveEmbeds } from './markdown/embeds.ts';
import {
  rehypeNormalizeAssetPaths,
  rehypeLocalizeRemoteAssets,
  rehypeLazyImages,
  rehypeWrapTables,
  rehypeContentDecorations,
  rehypePublications,
  rehypeHeadingSlugs,
  rehypeFilterIframes,
  rehypeLocalizeHrefs,
} from './markdown/decorations.ts';
import type { MarkdownOptions } from './markdown/types.ts';

export type { MarkdownOptions } from './markdown/types.ts';

const DEFAULT_SHIKI_THEMES = { light: 'github-light', dark: 'github-dark' };

// ---------------------------------------------------------------------------
// 管线
// ---------------------------------------------------------------------------

/** 构建一条 markdown → HTML 渲染管线（processor 可复用，内部已缓存 Shiki 实例） */
export function createMarkdownProcessor(options: MarkdownOptions = {}) {
  const themes = options.shikiThemes ?? DEFAULT_SHIKI_THEMES;
  const baseUrl = options.baseUrl ?? getBaseUrl();
  const warn = console.warn;
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkMath)
    .use(() => remarkCustomDirectives(baseUrl, !!options.editSource, options.lang, options.defaultLang, options.publications));
  // 编辑模式坐标注入必须在 remarkRehype 之前（mdast 阶段），且晚于自定义指令映射
  // （指令的 hProperties 先建好，这里合并 data-oh-src）
  if (options.editSource) processor.use(() => remarkEditSpans(options.editSource!));
  processor
    const ui = getUiLabels(options.lang);
  processor.use(remarkRehype, {
    allowDangerousHtml: true,
    footnoteLabel: ui.footnotes.label,
    footnoteLabelTagName: 'h2',
    footnoteLabelProperties: { className: ['footnotes-title'] },
    footnoteBackLabel: (refIndex, rerefIndex) =>
      rerefIndex && rerefIndex > 1
        ? ui.footnotes.backToRef(refIndex + 1) + "-" + rerefIndex
        : ui.footnotes.backToRef(refIndex + 1),
  })
    .use(rehypeRaw)
    .use(rehypeKatex)
    .use(rehypeShiki, {
    themes,
    defaultColor: false,
    addLanguageClass: true,
    transformers: [
      {
        pre(node) {
          node.properties["data-language"] = this.options.lang;
        },
      },
    ],
  })
    .use(() => rehypeNormalizeAssetPaths(baseUrl))
    .use(rehypeLazyImages)
    .use(rehypeSanitize, buildSanitizeSchema())
    .use(() => rehypeContentDecorations(options.lang, options.defaultLang))
    .use(rehypeFilterIframes)
    .use(rehypeWrapTables);
  if (options.headingSlugs || options.toc) processor.use(rehypeHeadingSlugs);
  if (options.publications) {
    processor.use(() => rehypePublications(options.publications!, options.lang, options.defaultLang, baseUrl));
  }

  // 自动解析 Bilibili / YouTube 远程信息，并在随后触发本地化下载
  processor.use(() => rehypeResolveEmbeds(options, baseUrl));

  // 远程媒体下载在 sanitize/iframe 过滤之后：只改写 src/poster 属性，不影响结构
  if (options.localizeAssets) {
    processor.use(() => rehypeLocalizeRemoteAssets(baseUrl, options.localizeAssets!));
  }

  if (options.streamEmbeds) processor.use(() => rehypeStreamEmbeds(options.streamEmbeds!, warn));
  if (options.ghCards) processor.use(() => rehypeGhCards(options.ghCards!));
  if (options.editorialEmbeds) processor.use(() => rehypeEditorialEmbeds(options.editorialEmbeds!, warn));
  if (options.localizeHrefs) {
    const localizeOpts = { ...options.localizeHrefs, baseUrl: options.localizeHrefs.baseUrl ?? baseUrl };
    processor.use(() => rehypeLocalizeHrefs(localizeOpts));
  }
  return processor.use(rehypeStringify, { allowDangerousHtml: true });
}

const processorCache = new Map<string, ReturnType<typeof createMarkdownProcessor>>();

/** 渲染 markdown 为 HTML 字符串；相同 options 复用同一 processor */
export async function renderMarkdown(
  markdown: string,
  options: MarkdownOptions = {}
): Promise<string> {
  const key = JSON.stringify(options);
  let processor = processorCache.get(key);
  if (!processor) {
    processor = createMarkdownProcessor(options);
    processorCache.set(key, processor);
  }
  return String(await processor.process(markdown));
}
