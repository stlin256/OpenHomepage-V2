/**
 * 编辑器 i18n 静态扫描守护：
 * 1. admin/ui 中所有 t('<key>') 调用必须存在于 i18n 字典；
 * 2. admin/ui 不得出现未走字典的可疑英文字符串字面量（两个及以上英文单词）——
 *    白名单豁免：路径/hash/CSS 选择器/SVG 标记/URL/MIME/HTTP 方法/样式类名；
 *    专有名词与字段名（slug、frontmatter、owner/repo 等）不含空格，不会被命中。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dict } from '../admin/shared/i18n.ts';

const UI_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../admin/ui');
const CSS_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../admin/public/styles.css');

function listUiFiles(): string[] {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith('.ts')) files.push(p);
    }
  };
  walk(UI_DIR);
  return files;
}

const LITERAL_RE = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;

function extractLiterals(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(LITERAL_RE)) {
    const lit = m[1] ?? m[2] ?? m[3] ?? '';
    if (!lit.includes('${')) out.push(lit);
  }
  return out;
}

describe('i18n 静态扫描', () => {
  const files = listUiFiles();

  it('所有 t() 调用的键都存在于字典', () => {
    const missing: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/\bt\(\s*'([^']+)'/g)) {
        if (!(m[1] in dict.zh) || !(m[1] in dict.en)) {
          missing.push(`${path.basename(f)}: t('${m[1]}')`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('UI 代码无未走字典的可疑英文字符串字面量', () => {
    const cjk = /[一-鿿]/;
    const twoWords = /[A-Za-z]{2,}\s+[A-Za-z]{2,}/;
    const classVocab = new Set(
      [...readFileSync(CSS_FILE, 'utf8').matchAll(/\.([a-z0-9][a-z0-9-]*)/g)].map((m) => m[1])
    );
    const isClassList = (lit: string) =>
      lit.length > 0 && lit.split(/\s+/).every((tok) => classVocab.has(tok));
    const whitelist = [
      /^\//, // API 路径
      /^#/, // hash 路由 / 颜色值
      /^\./, // CSS 选择器
      /^</, // SVG/HTML 标记
      /:\/\//, // URL
      /^[a-z-]+(\/[a-z0-9.+-]+)?$/i, // header 名 / MIME 类型
      /^[A-Z0-9 ]+$/, // 全大写（HTTP 方法等）
    ];
    const hits: string[] = [];
    for (const f of files) {
      for (const lit of extractLiterals(readFileSync(f, 'utf8'))) {
        if (cjk.test(lit) || !twoWords.test(lit)) continue;
        if (isClassList(lit)) continue;
        if (whitelist.some((r) => r.test(lit))) continue;
        hits.push(`${path.basename(f)}: ${JSON.stringify(lit.slice(0, 80))}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
