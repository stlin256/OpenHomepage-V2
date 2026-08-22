/**
 * 主页 home.layout 驱动渲染的纯函数层（见 docs/specs/01-config-schema.md）。
 * M4a 只渲染 profile / markdown 实体区块；streaming / github / rss 由 M4b 实现，
 * 此处仅按配置顺序保留挂载点。
 */

export const KNOWN_HOME_BLOCKS = ['profile', 'markdown', 'streaming', 'github', 'rss'] as const;
export type KnownHomeBlock = (typeof KNOWN_HOME_BLOCKS)[number];

export interface PlannedHomeBlock {
  block: KnownHomeBlock;
  id?: string;
}

/** site.yaml 未配置 home.layout 时的默认布局 */
export const DEFAULT_HOME_LAYOUT: PlannedHomeBlock[] = [{ block: 'profile' }, { block: 'markdown' }];

/**
 * 解析 home.layout：按配置顺序输出区块列表；未知区块跳过并 warning。
 * layout 缺省或为空时返回默认布局。
 */
export function planHomeBlocks(
  layout: { block: string; id?: string }[] | undefined,
  warn: (msg: string) => void = console.warn,
): PlannedHomeBlock[] {
  if (!layout || layout.length === 0) return DEFAULT_HOME_LAYOUT.map((b) => ({ ...b }));
  const planned: PlannedHomeBlock[] = [];
  for (const item of layout) {
    if ((KNOWN_HOME_BLOCKS as readonly string[]).includes(item.block)) {
      planned.push({ block: item.block as KnownHomeBlock, id: item.id });
    } else {
      warn(`home.layout 含未知区块 "${item.block}"，已跳过 / Unknown home block "${item.block}" skipped.`);
    }
  }
  return planned;
}
