/**
 * 场景化预设单一数据源（spec 15 / spec 22）。
 * `npm run setup` 以纯 node 运行（无法 import TS），admin 新手向导（TS）也消费本表，
 * 故定义放在纯 JS 模块并由 setup-lib.mjs / admin 两侧共享，避免两份漂移。
 * 类型声明见同目录 scene-presets.d.mts。
 */

/** 语言体系预设：向导选项 → pages 语言目录列表（首项为默认语言） */
export const LANG_PRESETS = {
  zh: ['zh'],
  en: ['en'],
  'zh-en': ['zh', 'en'],
  all: ['zh', 'en', 'ja', 'fr'],
};

/**
 * 场景化预设（纯数据表）：快速向导的模块勾选与语言建议默认值。
 * 预设只是默认值——用户随后仍可逐项调整语言与模块。
 * 注意：映射只覆盖五个可裁剪模块（publications/github/rss/bgm/contact）；经历时间轴 /
 * 画廊 / 流式块由页面与 editorial_blocks 自带，不参与模块裁剪（见 spec 15 §2.1）。
 */
export const SCENE_PRESETS = {
  // 🎓 学术科研型：学术成果 + RSS 前沿动态 + GitHub 卡片，默认中英双语
  academic: {
    langs: LANG_PRESETS['zh-en'],
    modules: { publications: true, github: true, rss: true, bgm: false, contact: true },
  },
  // 💻 开发者与开源作者：GitHub 热力图 + Pinned 仓库卡（流式块为示例页自带内容），默认中英双语
  developer: {
    langs: LANG_PRESETS['zh-en'],
    modules: { publications: false, github: true, rss: false, bgm: false, contact: true },
  },
  // 🎨 创作者与摄影博主：BGM 播放列表 + 联系卡（画廊为示例页自带内容），默认仅中文
  creator: {
    langs: LANG_PRESETS['zh'],
    modules: { publications: false, github: false, rss: false, bgm: true, contact: true },
  },
  // ⚡ 极简纯净名片：仅 profile + 联系卡，默认仅中文
  minimal: {
    langs: LANG_PRESETS['zh'],
    modules: { publications: false, github: false, rss: false, bgm: false, contact: true },
  },
  // 🛠️ 自定义：现状全手动（中英双语 + 全模块默认开启）
  custom: {
    langs: LANG_PRESETS['zh-en'],
    modules: { publications: true, github: true, rss: true, bgm: true, contact: true },
  },
};

/** 场景预设 key 列表（向导按此顺序展示；custom 恒为兜底） */
export const SCENE_PRESET_KEYS = ['academic', 'developer', 'creator', 'minimal', 'custom'];

/**
 * 解析场景预设（纯函数）：未知/空 key 回退 custom。
 * 返回深拷贝，调用方可自由覆盖默认值而不污染数据表。
 */
export function resolveScenePreset(key) {
  const preset = SCENE_PRESETS[key] ?? SCENE_PRESETS.custom;
  return { langs: [...preset.langs], modules: { ...preset.modules } };
}

/** 反查语言数组对应的 LANG_PRESETS key（把预设语言作为语言问题的默认选项）；无匹配回退 zh-en */
export function langPresetKeyFor(langs) {
  const list = Array.isArray(langs) ? langs : [];
  for (const [key, value] of Object.entries(LANG_PRESETS)) {
    if (value.length === list.length && value.every((v, i) => v === list[i])) return key;
  }
  return 'zh-en';
}
