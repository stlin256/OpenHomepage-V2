/**
 * renderMarkdown / createMarkdownProcessor 的渲染选项类型（MarkdownOptions）。
 * 自原 src/lib/markdown.ts 拆分而来（纯搬移，不改实现）；门面 src/lib/markdown.ts 从此 re-export。
 */

import type { PublicationsConfig } from '../publications.ts';
import type { RemoteFetchFn } from '../remote-assets.ts';

export interface MarkdownOptions {
  /** 站点 base URL，用于静态资源与链接补齐前缀（缺省自动读取或为 /） */
  baseUrl?: string;
  /**
   * 可视化编辑模式（M12a，docs/specs/12 §2.2）：页面正文的 data/ 相对路径
   * （如 pages/zh/index.md）。存在时启用 remarkEditSpans——给每个可编辑块的 hast 元素
   * 注入 data-oh-src="<editSource>:<start>,<end>" 坐标（与 listEditableBlocks 同一函数，
   * 坐标与 admin 块级 API 一致）；stream/ghcard/editorial 占位由整段替换改为 oh-embed 包裹；
   * 缺参/未知指令不降级为纯文本，改渲染占位卡（oh-directive-placeholder，保持节点类型
   * 不变、坐标照常注入，overlay 可点击打开检查器）。生产渲染（无 editSource）零注入。
   */
  editSource?: string;
  /** 当前内容语言：callout/timeline 缺省文案使用；缺省按 en 处理 */
  lang?: string;
  /** 站点默认语言：多语言回退链使用 */
  defaultLang?: string;
  /** 学术成果配置（data/publications.yaml 归一化结果） */
  publications?: PublicationsConfig;
  headingSlugs?: boolean;
  toc?: boolean | 'auto';
  /** Shiki 明暗双主题（CSS 变量双写方案，前端按主题切换 var） */
  shikiThemes?: { light: string; dark: string };
  /**
   * 流式区块嵌入：id → 构建好的完整 HTML 片段（src/lib/stream.ts 的 streamEmbedHtml）。
   * markdown 中 `::stream{id}` 占位（.stream-block div）在 rehype 阶段被整段替换；
   * id 未匹配时移除占位并 warning。
   */
  streamEmbeds?: Record<string, string>;
  /**
   * GitHub 仓库卡片：仓库 full_name（小写）→ 卡片 HTML 片段
   * （src/lib/github-block.ts 的 repoCardHtml，数据来自 .cache/github.json pinned）。
   * markdown 中 `::ghcard{repo}` 占位（.gh-card div）被替换；匹配不到移除并 warning。
   */
  ghCards?: { htmlByRepo: Record<string, string>; warn?: (msg: string) => void };
  /** 编辑区块 id → 构建好的完整 HTML 片段（src/lib/editorial-block.ts） */
  editorialEmbeds?: Record<string, string>;
  /** 当前路由语言下的站内链接改写参数；缺省时保留作者写的链接 */
  localizeHrefs?: {
    lang: string;
    defaultLang: string;
    slugs: string[];
    baseUrl?: string;
  };
  /**
   * 远程媒体本地化：img/video/audio/source 的 http(s) src/poster 在渲染时下载到
   * <dataDir>/assets/remote/ 并改写为本地路径（URL→路径映射持久化在 .cache/
   * remote-assets.json，同一 URL 跨页面/跨构建只下载一次）。下载失败保留原 URL。
   * 仅真实 data/ 目录生效（data.example/ 为入库示例数据，不写入）。
   */
  localizeAssets?: { dataDir: string; fetchFn?: RemoteFetchFn; warn?: (msg: string) => void };
}
