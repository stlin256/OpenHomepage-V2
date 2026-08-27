/**
 * 站点配置（site.yaml）与 RSS 配置（rss.yaml）的读写。
 * 读：返回原始解析对象（即使 schema 暂缺字段，编辑器要能打开并修正）。
 * 写：先 schema 校验（复用 src/lib/config.ts 的纯校验函数）→ 快照旧版本 → dump YAML。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { load as loadYaml, dump as dumpYaml } from 'js-yaml';
import {
  validateSiteConfig,
  validateRssConfig,
  type SiteConfig,
  type RssConfig,
} from '../../src/lib/config.ts';
import { parseConfigPath, stepConfigPath } from '../shared/cfgpath.ts';
import { createSnapshot } from './snapshots.ts';

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function readYamlFile(abs: string): unknown {
  let text: string;
  try {
    text = readFileSync(abs, 'utf8');
  } catch {
    throw new Error(`找不到配置文件：${abs}`);
  }
  try {
    return loadYaml(text);
  } catch (e) {
    throw new Error(`YAML 解析失败（${path.basename(abs)}）：${(e as Error).message}`);
  }
}

export function readSiteConfig(dataDir: string): SiteConfig {
  return readYamlFile(path.join(dataDir, 'site.yaml')) as SiteConfig;
}

export function readRssConfig(dataDir: string): RssConfig {
  return readYamlFile(path.join(dataDir, 'rss.yaml')) as RssConfig;
}

export function writeSiteConfig(dataDir: string, cfg: SiteConfig): void {
  validateSiteConfig(cfg);
  const accent = cfg.theme?.accent;
  if (accent !== undefined && !HEX_COLOR_RE.test(accent)) {
    throw new Error(`theme.accent 必须是 #rgb 或 #rrggbb 形式的 hex 色值，当前为：${accent}`);
  }
  const background = cfg.theme?.background;
  if (background !== undefined && !HEX_COLOR_RE.test(background)) {
    throw new Error(`theme.background 必须是 #rgb 或 #rrggbb 形式的 hex 色值，当前为：${background}`);
  }
  const backgroundDark = cfg.theme?.background_dark;
  if (backgroundDark !== undefined && !HEX_COLOR_RE.test(backgroundDark)) {
    throw new Error(
      `theme.background_dark 必须是 #rgb 或 #rrggbb 形式的 hex 色值，当前为：${backgroundDark}`
    );
  }
  writeConfig(dataDir, 'site.yaml', cfg);
}

export function writeRssConfig(dataDir: string, cfg: RssConfig): void {
  validateRssConfig(cfg);
  writeConfig(dataDir, 'rss.yaml', cfg);
}

/**
 * 单字段写回（M12d，POST /api/config/field，docs/specs/12 §2.5）：
 * { file: 'site'|'rss', path: 'a.b.c', lang?, value } —— 按 `.` 分段定位（数组段按
 * 数字下标或元素 id 匹配，见 shared/cfgpath.ts），然后：
 * - 当前值是多语言对象（{zh,en} 形态）→ 写 obj[lang]（lang 必填）；
 * - 当前值是字符串 → 整值替换（不区分语言——纯字符串字段本身无语言维度，
 *   就地改字编辑的是哪个语言的渲染值不影响存储形态；保持简单，不自动升级为对象）；
 * - 路径不存在 / 目标不是文本字段（数组、嵌套对象等）→ 抛错（http 层归一化为 400）。
 * 写前经 writeSiteConfig/writeRssConfig 的 schema 校验 + 快照，校验失败不落盘。
 */
export function writeConfigField(
  dataDir: string,
  payload: { file?: unknown; path?: unknown; lang?: unknown; value?: unknown }
): { ok: true } {
  const file = String(payload.file ?? '');
  if (file !== 'site' && file !== 'rss') {
    throw new Error(`非法的配置文件：${file}（仅支持 site/rss）`);
  }
  const dotted = String(payload.path ?? '');
  const segments = parseConfigPath(dotted);
  if (!segments) throw new Error(`非法的字段路径：${dotted}`);
  if (typeof payload.value !== 'string') {
    throw new Error('非法的字段值：value 必须是字符串');
  }
  const value = payload.value;
  const lang = typeof payload.lang === 'string' && payload.lang !== '' ? payload.lang : undefined;

  const cfg = file === 'site' ? readSiteConfig(dataDir) : readRssConfig(dataDir);
  // 定位到最后一段的父容器（必须是对象，最终值写它的属性）
  let container: unknown = cfg;
  for (const seg of segments.slice(0, -1)) {
    container = stepConfigPath(container, seg);
    if (container === undefined) throw new Error(`路径不存在：${dotted}`);
  }
  if (!container || typeof container !== 'object' || Array.isArray(container)) {
    throw new Error(`路径不存在：${dotted}（父级不是配置对象）`);
  }
  const holder = container as Record<string, unknown>;
  const last = segments.at(-1)!;
  const current = holder[last];
  if (current === undefined) throw new Error(`路径不存在：${dotted}`);

  if (typeof current === 'string') {
    holder[last] = value;
  } else if (current && typeof current === 'object' && !Array.isArray(current)) {
    if (!lang) throw new Error(`缺少 lang：${dotted} 是多语言对象（{zh,en} 形态）`);
    (current as Record<string, unknown>)[lang] = value;
  } else {
    throw new Error(`不支持就地改字的字段类型：${dotted}`);
  }

  if (file === 'site') writeSiteConfig(dataDir, cfg as SiteConfig);
  else writeRssConfig(dataDir, cfg as RssConfig);
  return { ok: true };
}

function writeConfig(dataDir: string, name: string, cfg: unknown): void {
  const abs = path.join(dataDir, name);
  if (!existsSync(abs)) throw new Error(`找不到配置文件：${abs}`);
  createSnapshot(dataDir, name);
  writeFileSync(abs, dumpYaml(cfg), 'utf8');
}
