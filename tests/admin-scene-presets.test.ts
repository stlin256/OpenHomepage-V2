/**
 * 新手向导第 0 步「场景预设」（spec 22 §3）测试：
 * admin/shared/scene-presets.ts 的映射纯逻辑，以及与 CLI setup 共用单一数据源
 * （scripts/scene-presets.mjs，经 setup-lib.mjs re-export）不漂移的守护。
 */
import { describe, it, expect } from 'vitest';
import { sceneDefaults, SCENE_PRESET_KEYS } from '../admin/shared/scene-presets.ts';
import {
  SCENE_PRESET_KEYS as CLI_SCENE_PRESET_KEYS,
  SCENE_PRESETS as CLI_SCENE_PRESETS,
  resolveScenePreset,
} from '../scripts/setup-lib.mjs';

describe('sceneDefaults：场景 → 向导模块默认值', () => {
  it('academic：github/rss 开、BGM 关、联系卡开，建议中英双语', () => {
    expect(sceneDefaults('academic')).toEqual({
      modules: { github: true, rss: true },
      bgmEnabled: false,
      contactEnabled: true,
      suggestedLangs: ['zh', 'en'],
    });
  });

  it('creator：BGM 开、github/rss 关，建议仅中文', () => {
    const d = sceneDefaults('creator');
    expect(d?.modules).toEqual({ github: false, rss: false });
    expect(d?.bgmEnabled).toBe(true);
    expect(d?.contactEnabled).toBe(true);
    expect(d?.suggestedLangs).toEqual(['zh']);
  });

  it("custom 与未知 key → null（保持当前配置，现状全手动）", () => {
    expect(sceneDefaults('custom')).toBeNull();
    expect(sceneDefaults('nope')).toBeNull();
    expect(sceneDefaults('')).toBeNull();
  });
});

describe('与 CLI setup 的单一数据源（scripts/scene-presets.mjs）不漂移', () => {
  it('admin 与 setup-lib 的场景 key 列表一致', () => {
    expect([...SCENE_PRESET_KEYS]).toEqual([...CLI_SCENE_PRESET_KEYS]);
  });

  it('每个非 custom 场景的 admin 默认值与 CLI 预设的模块/语言一致', () => {
    for (const key of CLI_SCENE_PRESET_KEYS) {
      if (key === 'custom') continue;
      const d = sceneDefaults(key)!;
      const preset = resolveScenePreset(key);
      expect(d.modules.github).toBe(preset.modules.github);
      expect(d.modules.rss).toBe(preset.modules.rss);
      expect(d.bgmEnabled).toBe(preset.modules.bgm);
      expect(d.contactEnabled).toBe(preset.modules.contact);
      expect(d.suggestedLangs).toEqual(preset.langs);
    }
    // 数据表本身仍是同一份对象（引用相等，杜绝两份拷贝）
    expect(CLI_SCENE_PRESETS.academic.modules.github).toBe(true);
  });
});
