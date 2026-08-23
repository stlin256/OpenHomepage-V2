/**
 * 编辑器指令卡片的预览数据：.cache/github.json 的 pinned 仓库（::ghcard 用）
 * 与 site.yaml 的流式区块标题/内容摘要（::stream 用）。
 * 全部宽松读取：缓存/配置/文件缺失或损坏时对应部分降级为空，不抛错。
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadSiteConfig, resolveText } from '../../src/lib/config.ts';
import { markdownExcerpt } from '../shared/markdown-excerpt.ts';

export interface GhPinnedPreview {
  full_name: string;
  description?: string | null;
  note?: string | null;
  language?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  html_url?: string;
}

export interface StreamPreview {
  id: string;
  title: string;
  /** 内容文件的纯文本摘要（markdown 语法已剥离） */
  excerpt: string;
}

export interface DirectivePreview {
  pinned: GhPinnedPreview[];
  streams: StreamPreview[];
}

/** 流式内容文件解析（与 src/lib/stream.ts resolveStreamingFile 同规则的轻量版，避免引入渲染管线） */
function resolveStreamFile(dataDir: string, contentFile: string): string | null {
  const dir = path.dirname(contentFile);
  const base = path.basename(contentFile);
  for (const l of ['zh', 'en']) {
    const p = path.join(dataDir, dir, l, base);
    if (existsSync(p)) return p;
  }
  const direct = path.join(dataDir, contentFile);
  return existsSync(direct) ? direct : null;
}

export function readDirectivePreview(rootDir: string, dataDir: string): DirectivePreview {
  // pinned：prefetch 产物（可能不存在——没跑过 prefetch 时 ghcard 预览降级为占位卡）
  let pinned: GhPinnedPreview[] = [];
  try {
    const cache = JSON.parse(readFileSync(path.join(rootDir, '.cache', 'github.json'), 'utf8')) as {
      pinned?: { data?: unknown };
    };
    const repos = cache.pinned?.data;
    if (Array.isArray(repos)) {
      pinned = repos
        .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
        .map((r) => ({
          full_name: String(r.full_name ?? ''),
          description: (r.description as string | null | undefined) ?? null,
          note: (r.note as string | null | undefined) ?? null,
          language: (r.language as string | null | undefined) ?? null,
          stargazers_count: typeof r.stargazers_count === 'number' ? r.stargazers_count : undefined,
          forks_count: typeof r.forks_count === 'number' ? r.forks_count : undefined,
          html_url: (r.html_url as string | undefined) ?? undefined,
        }))
        .filter((r) => r.full_name !== '');
    }
  } catch {
    /* 缓存缺失/损坏：空列表 */
  }

  // streams：site.yaml 定义 + 内容文件摘要（zh → en → 原路径回退）
  let streams: StreamPreview[] = [];
  try {
    const site = loadSiteConfig(dataDir);
    streams = (site.streaming_blocks ?? []).map((def) => {
      const file = resolveStreamFile(dataDir, def.content_file);
      return {
        id: def.id,
        title: def.title === undefined ? '' : resolveText(def.title, 'zh'),
        excerpt: file ? markdownExcerpt(readFileSync(file, 'utf8')) : '',
      };
    });
  } catch {
    /* 配置读不出：空列表 */
  }

  return { pinned, streams };
}
