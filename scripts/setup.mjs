/**
 * npm run setup —— 交互式初始化向导（docs/specs/15-setup-wizard.md）。
 * 薄 CLI 层：仅负责 readline 问答与终端输出，业务逻辑在 setup-lib.mjs。
 * 非交互环境（管道 / CI / --example/--blank/--yes）自动回退为复制完整示例。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { runSetup, LANG_PRESETS, MODULE_KEYS } from './setup-lib.mjs';

const MODULE_LABELS = {
  publications: '学术成果（publications 列表 + BibTeX）',
  github: 'GitHub 卡片（贡献热力图 + Pinned 仓库）',
  rss: 'RSS 前沿动态聚合',
  bgm: '背景音乐播放列表',
  contact: '右下角二维码联系卡',
};

const LANG_LABELS = {
  zh: '仅中文',
  en: '仅英文',
  'zh-en': '中英双语',
  all: '四语（中英日法）',
};

async function ask() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const question = (q) => rl.question(q);
    const askYesNo = async (label, def = true) => {
      const hint = def ? 'Y/n' : 'y/N';
      const ans = (await question(`    ${label}？ [${hint}] `)).trim().toLowerCase();
      return ans === '' ? def : ans.startsWith('y');
    };

    console.log('\nOpenHomepage-V2 初始化向导\n');
    console.log('  1) ⚡ 快速向导（推荐）：姓名 + 语言 + 模块，生成个性化 data/');
    console.log('  2) 📦 完整示例：复制全量四语演示站');
    console.log('  3) 📄 纯净空白：最小骨架，从零写起');
    const modeAns = (await question('\n请选择模式 [1/2/3，默认 1]: ')).trim();

    if (modeAns === '2') return { mode: 'example' };
    if (modeAns === '3') return { mode: 'blank', options: { lang: 'zh' } };

    // 快速向导
    const nameZh = (await question('\n姓名（中文，可留空）: ')).trim();
    const nameEn = (await question('姓名（英文，可留空）: ')).trim();
    const taglineZh = (await question('Tagline（中文，可留空）: ')).trim();
    const taglineEn = (await question('Tagline（英文，可留空）: ')).trim();
    const githubUser = (await question('GitHub 用户名（可留空，仅写入配置不联网）: ')).trim();

    console.log('\n语言体系：');
    const presetKeys = Object.keys(LANG_PRESETS);
    presetKeys.forEach((key, i) => console.log(`  ${i + 1}) ${LANG_LABELS[key]}`));
    const langAns = (await question('请选择 [1-4，默认 3 中英双语]: ')).trim();
    const langs = LANG_PRESETS[presetKeys[Number(langAns) - 1]] ?? LANG_PRESETS['zh-en'];

    console.log('\n功能模块（逐项确认）：');
    const modules = {};
    for (const key of MODULE_KEYS) modules[key] = await askYesNo(MODULE_LABELS[key], true);

    return { mode: 'quick', options: { nameZh, nameEn, taglineZh, taglineEn, githubUser, langs, modules } };
  } finally {
    rl.close();
  }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = await runSetup({
  rootDir: root,
  argv: process.argv.slice(2),
  env: process.env,
  isTTY: Boolean(process.stdin.isTTY),
  ask,
});

switch (result.mode) {
  case 'skipped':
    console.log('data/ 已存在，跳过复制。');
    break;
  case 'example':
    console.log('已从 data.example/ 复制生成 data/。');
    break;
  case 'blank':
    console.log('已生成纯净空白骨架 data/（单语言首页 + 最简 site.yaml）。');
    break;
  case 'quick':
    console.log('已按你的选择生成个性化 data/。运行 npm run dev 查看效果。');
    break;
}
