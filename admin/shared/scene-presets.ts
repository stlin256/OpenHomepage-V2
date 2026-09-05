/**
 * admin 新手向导第 0 步「场景预设」（spec 22 §3）：场景 → 向导模块默认值。
 * 预设数据的单一数据源在 scripts/scene-presets.mjs（CLI setup 以纯 node 运行，无法 import TS，
 * 故两边共享该 .mjs）；本模块只做「预设 → admin 向导语义」的映射，纯函数可单测。
 */
import { SCENE_PRESETS, SCENE_PRESET_KEYS } from '../../scripts/scene-presets.mjs';

export { SCENE_PRESET_KEYS };

export interface SceneDefaults {
  /**
   * 首页模块勾选默认值：映射到向导第 2 步的 github/rss 区块复选框。
   * publications 不在此列——它是 CLI setup 的文件级裁剪（删 publications.yaml/.bib），
   * admin 向导不动文件，仅编排 home.layout 与功能开关（见 spec 15 §2.1 / spec 19 §3）。
   */
  modules: { github: boolean; rss: boolean };
  /** 对应向导第 2 步「其他功能」的 BGM / 联系卡开关默认值 */
  bgmEnabled: boolean;
  contactEnabled: boolean;
  /** 建议语言（仅在第 0 步描述中提示；语言裁剪不做进向导，走「语言管理」面板） */
  suggestedLangs: string[];
}

/**
 * 场景 key → 向导默认值。'custom' 与未知 key 返回 null：保持当前配置不动（现状全手动）。
 * 返回新对象，调用方可自由使用。
 */
export function sceneDefaults(key: string): SceneDefaults | null {
  if (!(key in SCENE_PRESETS) || key === 'custom') return null;
  const preset = SCENE_PRESETS[key as keyof typeof SCENE_PRESETS];
  return {
    modules: { github: preset.modules.github, rss: preset.modules.rss },
    bgmEnabled: preset.modules.bgm,
    contactEnabled: preset.modules.contact,
    suggestedLangs: [...preset.langs],
  };
}
