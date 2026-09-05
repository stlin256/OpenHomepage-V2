/**
 * scene-presets.mjs 的类型声明（admin 侧 TS import 用；CLI 侧为纯 JS 无需类型）。
 */

export type LangPresetKey = 'zh' | 'en' | 'zh-en' | 'all';
export const LANG_PRESETS: Record<LangPresetKey, string[]>;

export type SceneModuleKey = 'publications' | 'github' | 'rss' | 'bgm' | 'contact';
export interface ScenePreset {
  langs: string[];
  modules: Record<SceneModuleKey, boolean>;
}
export type ScenePresetKey = 'academic' | 'developer' | 'creator' | 'minimal' | 'custom';
export const SCENE_PRESETS: Record<ScenePresetKey, ScenePreset>;
export const SCENE_PRESET_KEYS: ScenePresetKey[];

export function resolveScenePreset(key?: string): ScenePreset;
export function langPresetKeyFor(langs: unknown): string;
