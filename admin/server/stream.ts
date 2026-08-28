/**
 * 流式块内容文件的读写（M12g：overlay 流式内容编辑窗口，GET/POST /api/stream-content）。
 * 按 site.yaml streaming_blocks 的 id 找到 content_file，再沿语言回退链
 * （页面语言 → en → 默认语言 → 原路径，与渲染端 src/lib/stream.ts resolveStreamingFile
 * 同一函数）定位实际文件——编辑的就是当前页面正在展示的那份内容。
 * content_file 先过 safeResolve（限制在 data/ 内、拒绝穿越）；写：写前快照 + 落盘 +
 * notifyWrite（撤销链，admin/server/history.ts）。markdown 是自由文本，不做 schema 校验。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readSiteConfig } from './configs.ts';
import { createSnapshot } from './snapshots.ts';
import { notifyWrite } from './history.ts';
import { safeResolve } from './paths.ts';
import { resolveStreamingFile } from '../../src/lib/stream.ts';
import { normalizeLang } from '../../src/lib/routes.ts';

/** 资源不存在（id 未定义 / 内容文件缺失）：HTTP 404，由 http.ts sendError 识别 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** 请求方的语言参数归一化（'zh-CN' → 'zh'；空/非法 → undefined，由回退链兜到默认语言） */
function normalizeLangParam(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw !== '' ? normalizeLang(raw) : undefined;
}

/** id + 语言 → 实际内容文件（data/ 相对路径 + 绝对路径）；各失败出口：400（http 层 regex）/ 404（NotFoundError） */
function resolveContentFile(dataDir: string, id: string, lang?: string): { rel: string; abs: string } {
  if (!id) throw new Error('缺少流式块 id');
  const site = readSiteConfig(dataDir);
  const def = (site.streaming_blocks ?? []).find((b) => b.id === id);
  if (!def) throw new NotFoundError(`流式块不存在：${id} / Streaming block not found`);
  if (!def.content_file) throw new Error(`流式块缺少 content_file：${id}`);
  // content_file 先过路径校验（限制在 data/ 内、拒绝穿越），再走语言回退链
  safeResolve(dataDir, def.content_file);
  const defaultLang = normalizeLang(site.site?.language) ?? 'zh';
  const abs = resolveStreamingFile(dataDir, def.content_file, lang ?? defaultLang, defaultLang);
  if (!abs) {
    throw new NotFoundError(
      `流式块内容文件不存在：${def.content_file}（已按语言回退链查找）/ Content file not found`
    );
  }
  const rel = path.relative(dataDir, abs).split(path.sep).join('/');
  // 回退链产物再过一次 safeResolve（防御深度：确认仍落在 data/ 内）
  return { rel, abs: safeResolve(dataDir, rel) };
}

/** GET /api/stream-content：{ path, markdown }（path 为 data/ 相对路径，界面展示用） */
export function readStreamContent(
  dataDir: string,
  id: string,
  lang?: string
): { path: string; markdown: string } {
  const { rel, abs } = resolveContentFile(dataDir, id, lang);
  return { path: rel, markdown: readFileSync(abs, 'utf8') };
}

/** POST /api/stream-content：写回内容文件（写前快照 + notifyWrite；空 id / 非字符串 markdown 400） */
export function writeStreamContent(
  dataDir: string,
  payload: { id?: unknown; lang?: unknown; markdown?: unknown }
): { ok: true; path: string } {
  const id = String(payload.id ?? '');
  if (typeof payload.markdown !== 'string') {
    throw new Error('非法的内容：markdown 必须是字符串');
  }
  const { rel, abs } = resolveContentFile(dataDir, id, normalizeLangParam(payload.lang));
  createSnapshot(dataDir, rel);
  writeFileSync(abs, payload.markdown, 'utf8');
  notifyWrite(dataDir, rel); // 撤销/重做：新写盘使该文件 redo 栈作废
  return { ok: true, path: rel };
}
