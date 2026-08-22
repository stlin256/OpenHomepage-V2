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
  writeConfig(dataDir, 'site.yaml', cfg);
}

export function writeRssConfig(dataDir: string, cfg: RssConfig): void {
  validateRssConfig(cfg);
  writeConfig(dataDir, 'rss.yaml', cfg);
}

function writeConfig(dataDir: string, name: string, cfg: unknown): void {
  const abs = path.join(dataDir, name);
  if (!existsSync(abs)) throw new Error(`找不到配置文件：${abs}`);
  createSnapshot(dataDir, name);
  writeFileSync(abs, dumpYaml(cfg), 'utf8');
}
