/**
 * Milkdown 自定义指令节点（与 docs/specs/03 一一对应）：
 * bilibili/youtube/stream/ghcard 为叶指令（::name{attrs}），
 * video/audio/figure 为空容器指令（:::name{attrs}:::），
 * grid/grid_cell 为嵌套容器（::::grid 包 :::cell，外层冒号数自动多于内层）。
 * 节点只存参数（attrs.values），序列化经 remark-directive 还原为指令语法。
 */
import { $remark, $nodeSchema } from '@milkdown/utils';
import remarkDirective from 'remark-directive';
import type { NodeSchema } from '@milkdown/transformer';

/** 注册 remark-directive：解析与序列化指令节点都依赖它 */
export const directiveRemark = $remark('remark-directive', () => remarkDirective);

type Attrs = Record<string, string>;

interface DirectiveDef {
  /** Milkdown 节点 id（即 PM node name） */
  id: string;
  /** 指令名 */
  name: string;
  /** leaf = ::name；container = :::name（内容忽略，原子节点） */
  kind: 'leaf' | 'container';
  /** 展示用图标字符 */
  icon: string;
  /** 参数说明（界面渲染参数表单用；options 存在时渲染为下拉选择而非文本框） */
  params: { key: string; label: string; placeholder?: string; options?: string[] }[];
}

export const DIRECTIVE_DEFS: DirectiveDef[] = [
  { id: 'bilibili', name: 'bilibili', kind: 'leaf', icon: '📺', params: [{ key: 'bvid', label: 'BV 号', placeholder: 'BV1xx411c7mD' }] },
  { id: 'youtube', name: 'youtube', kind: 'leaf', icon: '▶️', params: [{ key: 'id', label: '视频 ID', placeholder: 'dQw4w9WgXcQ' }] },
  { id: 'video', name: 'video', kind: 'container', icon: '🎬', params: [{ key: 'src', label: 'src', placeholder: 'assets/demo.mp4' }, { key: 'poster', label: 'poster', placeholder: 'assets/cover.png' }] },
  { id: 'audio', name: 'audio', kind: 'container', icon: '🎵', params: [{ key: 'src', label: 'src', placeholder: 'assets/podcast.mp3' }] },
  { id: 'figure', name: 'figure', kind: 'container', icon: '🖼️', params: [{ key: 'src', label: 'src', placeholder: 'assets/photo.jpg' }, { key: 'caption', label: 'caption' }, { key: 'width', label: 'width', placeholder: '70%' }, { key: 'align', label: 'align', options: ['left', 'center', 'right'] }] },
  { id: 'stream', name: 'stream', kind: 'leaf', icon: '💬', params: [{ key: 'id', label: '区块 id', placeholder: 'welcome' }] },
  { id: 'ghcard', name: 'ghcard', kind: 'leaf', icon: '🐙', params: [{ key: 'repo', label: '仓库', placeholder: 'owner/repo' }] },
];

/** 生成原子指令节点 schema（叶 / 空容器共用：参数即全部状态） */
function atomDirectiveSchema(def: DirectiveDef): NodeSchema {
  const mdastType = def.kind === 'leaf' ? 'leafDirective' : 'containerDirective';
  return {
    group: 'block',
    atom: true,
    selectable: true,
    draggable: true,
    attrs: { values: { default: {} as Attrs } },
    parseDOM: [
      {
        tag: `div[data-directive="${def.name}"]`,
        getAttrs: (dom) => ({
          values: JSON.parse((dom as HTMLElement).getAttribute('data-values') ?? '{}') as Attrs,
        }),
      },
    ],
    toDOM: (node) => [
      'div',
      {
        'data-directive': def.name,
        'data-values': JSON.stringify(node.attrs.values),
        class: 'directive-card',
      },
      `${def.icon} ${def.name}`,
    ],
    parseMarkdown: {
      match: (node) => node.type === mdastType && node.name === def.name,
      runner: (state, node, type) => {
        state.addNode(type, { values: { ...(node.attributes as Attrs | undefined) } });
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === def.id,
      runner: (state, node) => {
        state.addNode(mdastType, undefined, undefined, {
          name: def.name,
          attributes: { ...(node.attrs.values as Attrs) },
        });
      },
    },
  };
}

export const directiveAtomNodes = DIRECTIVE_DEFS.map((def) =>
  $nodeSchema(def.id, () => atomDirectiveSchema(def))
);

/** grid 容器：:::cell 的直接父级；cols 参数在 grid 上 */
export const gridNode = $nodeSchema('grid', () => ({
  group: 'block',
  content: 'grid_cell+',
  defining: true,
  attrs: { values: { default: {} as Attrs } },
  parseDOM: [
    {
      tag: 'div[data-directive="grid"]',
      getAttrs: (dom) => ({
        values: JSON.parse((dom as HTMLElement).getAttribute('data-values') ?? '{}') as Attrs,
      }),
    },
  ],
  toDOM: (node) => [
    'div',
    {
      'data-directive': 'grid',
      'data-values': JSON.stringify(node.attrs.values),
      class: 'directive-grid',
    },
    0,
  ],
  parseMarkdown: {
    match: (node) => node.type === 'containerDirective' && node.name === 'grid',
    runner: (state, node, type) => {
      state.openNode(type, { values: { ...(node.attributes as Attrs | undefined) } });
      state.next(node.children);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'grid',
    runner: (state, node) => {
      state.openNode('containerDirective', undefined, {
        name: 'grid',
        attributes: { ...(node.attrs.values as Attrs) },
      });
      state.next(node.content);
      state.closeNode();
    },
  },
}));

export const gridCellNode = $nodeSchema('grid_cell', () => ({
  content: 'block+',
  defining: true,
  parseDOM: [{ tag: 'div[data-directive="cell"]' }],
  toDOM: () => ['div', { 'data-directive': 'cell', class: 'directive-cell' }, 0],
  parseMarkdown: {
    match: (node) => node.type === 'containerDirective' && node.name === 'cell',
    runner: (state, node, type) => {
      state.openNode(type);
      state.next(node.children);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'grid_cell',
    runner: (state, node) => {
      state.openNode('containerDirective', undefined, { name: 'cell' });
      state.next(node.content);
      state.closeNode();
    },
  },
}));

/** 全部指令节点（注册顺序即 schema 优先级；$NodeSchema 为 [ctx, plugin] 元组，需展开） */
export const directiveNodes = [
  ...directiveAtomNodes.flatMap((n) => [...n]),
  ...gridNode,
  ...gridCellNode,
];

/** 工具栏插入用示例片段 */
export const INSERT_SNIPPETS: Record<string, string> = {
  bilibili: '::bilibili{bvid=""}\n',
  youtube: '::youtube{id=""}\n',
  video: ':::video{src="" poster=""}\n:::\n',
  audio: ':::audio{src=""}\n:::\n',
  figure: ':::figure{src="" caption=""}\n:::\n',
  grid: '::::grid{cols=2}\n:::cell\n\n:::\n:::cell\n\n:::\n::::\n',
  stream: '::stream{id=""}\n',
  ghcard: '::ghcard{repo=""}\n',
};
