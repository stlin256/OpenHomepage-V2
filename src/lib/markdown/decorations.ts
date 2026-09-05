/**
 * rehype 内容装饰插件群：资产路径归一化与远程媒体本地化、图片懒加载、表格横向滚动包裹、
 * 脚注/外链/callout/timeline 装饰、publications 区块渲染、标题 slug、iframe 域名白名单过滤、
 * 站内链接本地化。自原 src/lib/markdown.ts 拆分而来（纯搬移，不改实现）。
 */

import { visit, SKIP } from 'unist-util-visit';
import type { Root as HastRoot, Element, ElementContent } from 'hast';
import { localizeInternalHref } from '../routes.ts';
import { withBase } from '../base-url.ts';
import { localizeRemoteAsset } from '../remote-assets.ts';
import { renderPublications, type PublicationsConfig, type PublicationQuery } from '../publications.ts';
import { generateHeadingSlug } from '../toc.ts';
import { hEl, hTxt, classesOf } from './utils.ts';
import { CALLOUT_ICON_PATHS, safeTimelineUrl, timelineRangeText } from './directives.ts';
import { IFRAME_SRC_ALLOWLIST } from './sanitize.ts';
import { wrapFragmentForEdit } from './edit-spans.ts';
import type { MarkdownOptions } from './types.ts';

export function rehypeNormalizeAssetPaths(baseUrl?: string) {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element) => {
      const tag = node.tagName;
      if (tag !== 'img' && tag !== 'video' && tag !== 'audio' && tag !== 'source') return;
      for (const attr of ['src', 'poster'] as const) {
        const v = node.properties?.[attr];
        if (typeof v === 'string') {
          if (v.startsWith('assets/')) {
            node.properties[attr] = withBase(`/${v}`, baseUrl);
          } else if (v.startsWith('/assets/')) {
            node.properties[attr] = withBase(v, baseUrl);
          }
        }
      }
    });
  };
}

/**
 * 远程媒体本地化：img/video/audio/source 的 http(s) src/poster 下载到
 * data/assets/remote/ 并改写为带 base 前缀的本地路径；下载失败保留原 URL。
 * 在 rehypeNormalizeAssetPaths 之后运行（本地路径已归一，这里只处理远程）。
 */
export function rehypeLocalizeRemoteAssets(
  baseUrl: string,
  opts: NonNullable<MarkdownOptions['localizeAssets']>,
) {
  return async (tree: HastRoot) => {
    const jobs: Promise<void>[] = [];
    visit(tree, 'element', (node: Element) => {
      const tag = node.tagName;
      if (tag !== 'img' && tag !== 'video' && tag !== 'audio' && tag !== 'source') return;
      for (const attr of ['src', 'poster'] as const) {
        const v = node.properties?.[attr];
        if (typeof v !== 'string' || !/^https?:\/\//i.test(v)) continue;
        jobs.push(
          localizeRemoteAsset(v, opts).then((local) => {
            if (local && node.properties) node.properties[attr] = withBase(`/${local}`, baseUrl);
          }),
        );
      }
    });
    await Promise.all(jobs);
  };
}

export function rehypeLazyImages() {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName === 'img' && node.properties && node.properties.loading == null) {
        node.properties.loading = 'lazy';
      }
    });
  };
}

/**
 * 表格横向滚动包裹：将 <table> 包进 <div class="md-table-wrap">（overflow-x: auto），
 * 防止移动端窄屏下表格被过度压缩或溢出视口；桌面端表格宽度仍自适应容器。
 */
export function rehypeWrapTables() {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'table' || parent == null || index == null) return;
      // 已在表格包裹容器内则跳过（避免重复嵌套）
      if (parent.type === 'element' && (parent as Element).tagName === 'div' &&
        classesOf(parent as Element).includes('md-table-wrap')) return;
      const wrapper: Element = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['md-table-wrap'] },
        children: [node],
      };
      parent.children[index] = wrapper;
    });
  };
}

function calloutHeader(node: Element): void {
  const type = classesOf(node).find((c) => c.startsWith('callout-'))?.slice('callout-'.length);
  if (!type) return;
  const title = String(node.properties?.dataCalloutTitle ?? '');
  const source = String(node.properties?.dataCalloutSource ?? '');
  const icon = hEl('span', { className: ['callout-icon'], ariaHidden: 'true' }, [
    hEl('svg', { viewBox: '0 0 24 24', fill: 'currentColor', ariaHidden: 'true' }, [
      hEl('path', { d: CALLOUT_ICON_PATHS[type] ?? CALLOUT_ICON_PATHS.note }),
    ]),
  ]);
  const heading = hEl('p', { className: ['callout-title'] }, [hTxt(title)]);
  node.children.unshift(hEl('div', { className: ['callout-header'] }, [icon, heading]));
  if (source) node.children.push(hEl('p', { className: ['callout-source'] }, [hTxt(source)]));
  delete node.properties?.dataCalloutTitle;
  delete node.properties?.dataCalloutSource;
}
export function rehypeContentDecorations(lang: string | undefined, defaultLang?: string) {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node) => {
      if (
        node.tagName === 'a' &&
        node.properties &&
        ('dataFootnoteBackref' in node.properties ||
          'data-footnote-backref' in node.properties ||
          classesOf(node).includes('data-footnote-backref') ||
          classesOf(node).includes('footnote-backref'))
      ) {
        const cls = classesOf(node);
        if (!cls.includes('data-footnote-backref')) {
          node.properties.className = [...cls, 'data-footnote-backref'];
        }
        const svgIcon = hEl(
          'svg',
          {
            className: ['footnote-backref-icon'],
            viewBox: '0 0 24 24',
            width: '13',
            height: '13',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: '2.2',
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            ariaHidden: 'true',
          },
          [
            hEl('path', { d: 'M9 14 4 9l5-5' }),
            hEl('path', { d: 'M20 20v-7a4 4 0 0 0-4-4H4' }),
          ],
        );
        const subIndexChildren = node.children.filter(
          (c) => c.type !== 'text' || (c.value !== '↩' && c.value.trim() !== '↩')
        );
        node.children = [svgIcon, ...subIndexChildren];
      }
      if (node.tagName === 'a' && node.properties && ('dataFootnoteRef' in node.properties || 'data-footnote-ref' in node.properties)) {
        const cls = classesOf(node);
        if (!cls.includes('footnote-ref')) {
          node.properties.className = [...cls, 'footnote-ref'];
        }
      } else if (node.tagName === 'a' && node.properties?.href) {
        const href = String(node.properties.href).trim();
        const isExternal = /^https?:\/\//i.test(href) || /^\/\//i.test(href);
        if (isExternal) {
          node.properties.target = '_blank';
          node.properties.rel = ['noopener', 'noreferrer'];
          const cls = classesOf(node);
          if (!cls.includes('external-link')) {
            node.properties.className = [...cls, 'external-link'];
          }
          const isImageOnly =
            node.children.length > 0 &&
            node.children.every(
              (c) =>
                (c.type === 'element' && (c.tagName === 'img' || c.tagName === 'video' || c.tagName === 'audio')) ||
                (c.type === 'text' && !c.value.trim()),
            );
          const hasExternalIcon = node.children.some(
            (c) =>
              c.type === 'element' &&
              (c.tagName === 'svg' || c.tagName === 'span') &&
              classesOf(c).some(
                (cn) => cn.includes('external-link-icon') || cn.includes('footnote-backref-icon'),
              ),
          );
          if (!isImageOnly && !hasExternalIcon) {
            const extSvg = hEl(
              'svg',
              {
                className: ['external-link-icon'],
                viewBox: '0 0 24 24',
                width: '12',
                height: '12',
                fill: 'none',
                stroke: 'currentColor',
                strokeWidth: '2',
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
                ariaHidden: 'true',
              },
              [
                hEl('path', { d: 'M7 17 17 7' }),
                hEl('path', { d: 'M7 7h10v10' }),
              ],
            );
            node.children.push(extSvg);
          }
        }
      }
      if (node.tagName === 'section' && (classesOf(node).includes('footnotes') || node.properties?.dataFootnotes != null || ('data-footnotes' in (node.properties || {})))) {
        const cls = classesOf(node);
        if (!cls.includes('reveal')) {
          node.properties.className = [...cls, 'reveal'];
        }
        node.properties.style = '--delay:120ms';
        for (const child of node.children) {
          if (child.type === 'element' && (child.tagName === 'h2' || child.tagName === 'h3' || child.properties?.id === 'footnote-label')) {
            child.properties.className = ['footnotes-title'];
          }
        }
        for (const child of node.children) {
          if (child.type === 'element' && child.tagName === 'ol') {
            child.properties.className = ['footnotes-list'];
            for (const item of child.children) {
              if (item.type === 'element' && item.tagName === 'li') {
                item.properties.className = ['footnote-item'];
              }
            }
          }
        }
      }
      if (node.tagName === 'aside' && classesOf(node).includes('callout')) {
        calloutHeader(node);
        return;
      }
      if (node.tagName !== 'section' || !(node.properties?.dataTimeline === 'true' || classesOf(node).includes('timeline'))) return;
      node.properties.className = ['timeline', 'reveal'];
      delete node.properties.dataTimeline;
      const title = String(node.properties?.dataTimelineTitle ?? '');
      if (title) node.children.unshift(hEl('h2', { className: ['timeline-title'] }, [hTxt(title)]));
      delete node.properties?.dataTimelineTitle;
      const items = node.children.filter((child): child is Element =>
        child.type === 'element' && child.tagName === 'div' && (child.properties?.dataTimelineItem === 'true' || classesOf(child).includes('timeline-item'))
      );
      if (items.length === 0) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        item.tagName = 'li';
        item.properties.className = ['timeline-item', 'reveal'];
        item.properties.style = "--delay:" + (i * 90) + "ms";
        delete item.properties.dataTimelineItem;
        const start = String(item.properties?.dataStart ?? '');
        const end = item.properties?.dataEnd == null ? undefined : String(item.properties.dataEnd);
        const range = hEl('p', { className: ['timeline-range'] }, [hTxt(timelineRangeText(start, end, lang, defaultLang))]);
        const itemTitle = String(item.properties?.dataTimelineTitle ?? '');
        const org = String(item.properties?.dataOrg ?? '');
        const url = safeTimelineUrl(item.properties?.dataUrl == null ? undefined : String(item.properties.dataUrl));
        const isExt = Boolean(url && (/^https?:\/\//i.test(url) || /^\/\//i.test(url)));
        const heading = hEl(
          url ? 'a' : 'h3',
          url
            ? {
                className: isExt ? ['timeline-item-title', 'external-link'] : ['timeline-item-title'],
                href: url,
                ...(isExt ? { target: '_blank', rel: ['noopener', 'noreferrer'] } : {}),
              }
            : { className: ['timeline-item-title'] },
          itemTitle
            ? isExt
              ? [
                  hTxt(itemTitle),
                  hEl(
                    'svg',
                    {
                      className: ['external-link-icon'],
                      viewBox: '0 0 24 24',
                      width: '12',
                      height: '12',
                      fill: 'none',
                      stroke: 'currentColor',
                      strokeWidth: '2',
                      strokeLinecap: 'round',
                      strokeLinejoin: 'round',
                      ariaHidden: 'true',
                    },
                    [hEl('path', { d: 'M7 17 17 7' }), hEl('path', { d: 'M7 7h10v10' })],
                  ),
                ]
              : [hTxt(itemTitle)]
            : []
        );
        const meta = hEl('div', { className: ['timeline-item-meta'] }, [
          heading,
          ...(org ? [hEl('p', { className: ['timeline-org'] }, [hTxt(org)])] : []),
        ]);
        const content = hEl('div', { className: ['timeline-item-body'] }, item.children);
        item.children = [range, meta, content];
        delete item.properties?.dataStart;
        delete item.properties?.dataEnd;
        delete item.properties?.dataTimelineTitle;
        delete item.properties?.dataOrg;
        delete item.properties?.dataUrl;
      }
      const list = hEl('ol', { className: ['timeline-items'] }, items);
      node.children = node.children.filter((child) => !items.includes(child as Element));
      node.children.push(list);
    });
  };
}function publicationQueryOf(node: Element): PublicationQuery {
  const value = (key: string): string | undefined => {
    const v = node.properties?.[key];
    return typeof v === 'string' && v ? v : undefined;
  };
  const group = value('dataGroup');
  const sort = value('dataSort');
  const limit = Number(value('dataLimit'));
  return {
    tag: value('dataTag'),
    type: value('dataType'),
    year: value('dataYear'),
    group: group === 'none' || group === 'type' ? group : 'year',
    sort: sort === 'date-asc' || sort === 'venue' || sort === 'order' ? sort : 'date-desc',
    limit: Number.isInteger(limit) && limit > 0 ? limit : undefined,
  };
}
export function rehypePublications(ctx: PublicationsConfig, lang?: string, defaultLang?: string, baseUrl?: string) {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.properties?.dataPublications !== 'true' || parent == null || index == null) return;
      const html = renderPublications(
        ctx.items,
        { lang, defaultLang, baseUrl, highlightAuthors: ctx.highlight_authors },
        publicationQueryOf(node),
      );
      parent.children[index] = {
        type: 'raw',
        value: wrapFragmentForEdit(node, html) ?? html,
      } as unknown as ElementContent;
      return [SKIP, index];
    });
  };
}function hastToText(node: ElementContent): string {
  if (node.type === 'text') return node.value;
  if ('children' in node && Array.isArray(node.children)) {
    return node.children.map(hastToText).join('');
  }
  return '';
}

export function rehypeHeadingSlugs() {
  return (tree: HastRoot) => {
    const existing = new Set<string>();
    let index = 1;
    visit(tree, 'element', (node: Element) => {
      if (!['h2', 'h3', 'h4'].includes(node.tagName)) return;
      if (node.properties?.id) {
        existing.add(String(node.properties.id));
        return;
      }
      const text = hastToText(node);
      const slug = generateHeadingSlug(text, existing, index++);
      node.properties = node.properties || {};
      node.properties.id = slug;
    });
  };
}

export function rehypeFilterIframes() {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'iframe' || parent == null || index == null) return;
      const src = String(node.properties?.src ?? '');
      if (!IFRAME_SRC_ALLOWLIST.some((re) => re.test(src))) {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
    });
  };
}

export function rehypeLocalizeHrefs(options: NonNullable<MarkdownOptions['localizeHrefs']>) {
  const slugs = new Set(options.slugs);
  const base = options.baseUrl ?? '/';
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'a' || typeof node.properties?.href !== 'string') return;
      const localized = localizeInternalHref(
        node.properties.href,
        options.lang,
        options.defaultLang,
        slugs
      );
      node.properties.href = withBase(localized, base);
    });
  };
}
