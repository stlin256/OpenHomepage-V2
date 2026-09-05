#!/usr/bin/env node
/**
 * 版本一致性守护：挂 npm version 生命周期钩子（package.json 的 "version" script），
 * 在 npm 生成发版提交前运行。
 *
 * 职责：
 * 1. 校验 package.json 与 package-lock.json 版本一致（npm 已同步，此处兜底）；
 * 2. 自愈示例内容——data.example/pages/（*\/）about.md 中若残留硬编码
 *    版本胶囊（v1.2.3 形式），重写为 v{{version}} 占位符（构建时由
 *    src/lib/version.ts 注入），由钩子命令中的 git add 并入发版提交。
 *
 * 版本号唯一事实来源是 package.json；本脚本不接受参数、不修改版本号本身。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

if (lock.version !== pkg.version) {
  console.error(`✗ 版本不一致：package.json=${pkg.version}，package-lock.json=${lock.version}`);
  process.exit(1);
}

const pagesDir = path.join(root, 'data.example', 'pages');
const hardcodedRe = /(<span class="version-label">)v\d+\.\d+\.\d+(<\/span>)/;
let fixed = 0;

if (existsSync(pagesDir)) {
  for (const lang of readdirSync(pagesDir)) {
    const file = path.join(pagesDir, lang, 'about.md');
    if (!existsSync(file)) continue;
    const content = readFileSync(file, 'utf8');
    if (!hardcodedRe.test(content)) continue;
    writeFileSync(file, content.replace(hardcodedRe, '$1v{{version}}$2'));
    console.log(`✓ 已将 ${path.relative(root, file)} 的硬编码版本胶囊改为 v{{version}} 占位符`);
    fixed++;
  }
}

if (fixed === 0) {
  console.log(`✓ 版本一致性检查通过（v${pkg.version}），示例内容无硬编码版本号`);
}
