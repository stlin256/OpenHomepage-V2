/**
 * 自定义指令元数据（与 docs/specs/03 一一对应，M12b 从旧编辑器 directive-nodes.ts
 * 抽离到 shared；M12e 旧编辑器已移除，本文件是唯一来源）：
 * overlay 插入抽屉与右侧检查器共用。
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
  /**
   * 参数说明（界面渲染参数表单用）：
   * - options 存在时渲染为固定取值下拉，asset 为 true 时渲染为素材下拉（M12c 检查器）；
   * - labelKey 为 i18n 字典键（M12c 检查器优先，缺省回退 label——label 仍供旧编辑器使用）。
   */
  params: {
    key: string;
    label: string;
    placeholder?: string;
    options?: string[];
    /** 素材引用字段（assets/<name> 或外链）：检查器渲染为素材下拉 */
    asset?: boolean;
    /** 字段标签的 i18n 键（admin/shared/i18n.ts） */
    labelKey?: string;
  }[];
}

export const DIRECTIVE_DEFS: DirectiveDef[] = [
  { id: 'bilibili', name: 'bilibili', kind: 'leaf', icon: '📺', params: [{ key: 'bvid', label: 'BV 号', labelKey: 'dirParamBvid', placeholder: 'BV1xx411c7mD' }] },
  { id: 'youtube', name: 'youtube', kind: 'leaf', icon: '▶️', params: [{ key: 'id', label: '视频 ID', labelKey: 'dirParamVideoId', placeholder: 'dQw4w9WgXcQ' }] },
  { id: 'video', name: 'video', kind: 'container', icon: '🎬', params: [{ key: 'src', label: 'src', placeholder: 'assets/demo.mp4', asset: true }, { key: 'poster', label: 'poster', placeholder: 'assets/cover.png', asset: true }] },
  { id: 'audio', name: 'audio', kind: 'container', icon: '🎵', params: [{ key: 'src', label: 'src', placeholder: 'assets/podcast.mp3', asset: true }] },
  { id: 'figure', name: 'figure', kind: 'container', icon: '🖼️', params: [{ key: 'src', label: 'src', placeholder: 'assets/photo.jpg', asset: true }, { key: 'caption', label: 'caption' }, { key: 'width', label: 'width', placeholder: '70%' }, { key: 'align', label: 'align', options: ['left', 'center', 'right'] }] },
  { id: 'stream', name: 'stream', kind: 'leaf', icon: '💬', params: [{ key: 'id', label: '区块 id', labelKey: 'dirParamBlockId', placeholder: 'welcome' }] },
  { id: 'ghcard', name: 'ghcard', kind: 'leaf', icon: '🐙', params: [{ key: 'repo', label: '仓库', labelKey: 'dirParamRepo', placeholder: 'owner/repo' }] },
  { id: 'editorial', name: 'editorial', kind: 'leaf', icon: '🧩', params: [{ key: 'id', label: '区块 id', labelKey: 'dirParamBlockId', placeholder: 'features' }] },
];

/** 指令名 → 展示名 i18n 键（admin/shared/i18n.ts；overlay 插入抽屉与 M12c 检查器标题共用） */
export const DIRECTIVE_LABEL_KEYS: Record<string, string> = {
  bilibili: 'dirBilibili',
  youtube: 'dirYoutube',
  video: 'dirVideo',
  audio: 'dirAudio',
  figure: 'dirFigure',
  grid: 'dirGrid',
  stream: 'dirStream',
  ghcard: 'dirGhcard',
  editorial: 'dirEditorial',
};

/** 插入用示例片段（overlay 插入抽屉；占位参数由检查器编辑） */
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
