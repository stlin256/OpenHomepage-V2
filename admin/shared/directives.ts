/**
 * 自定义指令元数据（与 docs/specs/03 一一对应，M12b 从 admin/ui/editor/directive-nodes.ts
 * 抽离到 shared）：overlay 插入抽屉与后续右侧检查器（M12c）共用；
 * Milkdown 节点视图部分仍留在 admin/ui/editor/（M12e 移除旧编辑器后仅保留本文件）。
 */

export interface DirectiveDef {
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
  { id: 'editorial', name: 'editorial', kind: 'leaf', icon: '🧩', params: [{ key: 'id', label: '区块 id', placeholder: 'features' }] },
];

/** 插入用示例片段（overlay 插入抽屉与旧编辑器工具栏共用；占位参数由 M12c 检查器编辑） */
export const INSERT_SNIPPETS: Record<string, string> = {
  bilibili: '::bilibili{bvid=""}\n',
  youtube: '::youtube{id=""}\n',
  video: ':::video{src="" poster=""}\n:::\n',
  audio: ':::audio{src=""}\n:::\n',
  figure: ':::figure{src="" caption=""}\n:::\n',
  grid: '::::grid{cols=2}\n:::cell\n\n:::\n:::cell\n\n:::\n::::\n',
  stream: '::stream{id=""}\n',
  ghcard: '::ghcard{repo=""}\n',
  editorial: '::editorial{id=""}\n',
};
