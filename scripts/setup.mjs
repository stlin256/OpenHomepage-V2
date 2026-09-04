/**
 * npm run setup —— 交互式初始化向导（docs/specs/15-setup-wizard.md）。
 * 薄 CLI 层：仅负责 readline 问答与终端输出，业务逻辑在 setup-lib.mjs。
 * 非交互环境（管道 / CI / --example/--blank/--yes）自动回退为复制完整示例。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import {
  runSetup,
  LANG_PRESETS,
  MODULE_KEYS,
  SCENE_PRESET_KEYS,
  resolveScenePreset,
  langPresetKeyFor,
  fetchGithubProfile,
} from './setup-lib.mjs';

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

const SCENE_LABELS = {
  academic: '🎓 学术科研型（学术成果 + 经历时间轴，默认中英双语）',
  developer: '💻 开发者与开源作者（GitHub 热力图 + 仓库卡 + 流式块，默认中英双语）',
  creator: '🎨 创作者与摄影博主（画廊 + BGM + 联系卡，默认仅中文）',
  minimal: '⚡ 极简纯净名片（仅 profile + 联系卡，默认仅中文）',
  custom: '🛠️ 自定义（逐项手动选择，全模块默认开启）',
};

/** GitHub name/bio 含中日韩文字时才作为中文提问的默认值 */
const hasCJK = (s) => /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(s ?? '');

async function ask() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const question = (q) => rl.question(q);
    const askWithDefault = async (label, def = '') => {
      const hint = def ? ` [${def}]` : '';
      const ans = (await question(`${label}${hint}: `)).trim();
      return ans || def;
    };
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

    // 快速向导 —— ① 场景预设：只决定后续语言/模块问题的默认值，逐项仍可覆盖
    console.log('\n场景预设（仅作为后续问题的默认值，直接回车选自定义）：');
    SCENE_PRESET_KEYS.forEach((key, i) => console.log(`  ${i + 1}) ${SCENE_LABELS[key]}`));
    const sceneAns = (await question('请选择 [1-5，默认 5 自定义]: ')).trim();
    const preset = resolveScenePreset(SCENE_PRESET_KEYS[Number(sceneAns) - 1]);

    // ② GitHub 用户名 + 公开资料预填（5 秒超时；失败静默跳过，绝不阻断向导）
    const githubUser = (await question('\nGitHub 用户名（可留空，将尝试拉取公开资料预填）: ')).trim();
    let gh = null;
    if (githubUser) {
      process.stdout.write('  正在从 GitHub 拉取公开资料（5 秒超时，失败自动跳过）…');
      gh = await fetchGithubProfile(githubUser);
      process.stdout.write(gh ? ' 已获取，将作为下列问题的默认值。\n' : ' 未获取到，继续手动填写。\n');
    }

    // ③ 个人信息（回车采纳预填默认值，可直接覆盖修改）
    const nameZh = await askWithDefault('姓名（中文，可留空）', gh?.name && hasCJK(gh.name) ? gh.name : '');
    const nameEn = await askWithDefault('姓名（英文，可留空）', gh?.name ?? '');
    const taglineZh = await askWithDefault('Tagline（中文，可留空）', gh?.bio && hasCJK(gh.bio) ? gh.bio : '');
    const taglineEn = await askWithDefault('Tagline（英文，可留空）', gh?.bio ?? '');
    const website = await askWithDefault('个人网站（可留空，写入联系链接）', gh?.blog ?? '');

    // ④ 语言体系（默认选项来自场景预设）
    const presetLangKey = langPresetKeyFor(preset.langs);
    console.log('\n语言体系：');
    const presetKeys = Object.keys(LANG_PRESETS);
    presetKeys.forEach((key, i) => console.log(`  ${i + 1}) ${LANG_LABELS[key]}`));
    const langAns = (await question(`请选择 [1-4，默认 ${presetKeys.indexOf(presetLangKey) + 1} ${LANG_LABELS[presetLangKey]}]: `)).trim();
    const langs = LANG_PRESETS[presetKeys[Number(langAns) - 1]] ?? LANG_PRESETS[presetLangKey];

    // ⑤ 功能模块（逐项确认，默认值来自场景预设）
    console.log('\n功能模块（逐项确认）：');
    const modules = {};
    for (const key of MODULE_KEYS) modules[key] = await askYesNo(MODULE_LABELS[key], preset.modules[key] ?? true);

    return { mode: 'quick', options: { nameZh, nameEn, taglineZh, taglineEn, githubUser, website, langs, modules } };
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
