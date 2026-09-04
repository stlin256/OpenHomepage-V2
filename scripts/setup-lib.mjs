/**
 * setup 向导核心逻辑（docs/specs/15-setup-wizard.md）。
 * 所有函数路径注入、不读 process.*，纯 Node + js-yaml，可被 vitest 直接 import。
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { load as loadYaml, dump as dumpYaml } from 'js-yaml';

/** 站点支持的语言（pages/<lang>/ 目录名） */
export const KNOWN_LANGS = ['zh', 'en', 'ja', 'fr'];

/** 语言体系预设：向导选项 → pages 语言目录列表（首项为默认语言） */
export const LANG_PRESETS = {
  zh: ['zh'],
  en: ['en'],
  'zh-en': ['zh', 'en'],
  all: ['zh', 'en', 'ja', 'fr'],
};

/** 语言目录名 → site.language 取值 */
export const LANG_TO_SITE_LANGUAGE = { zh: 'zh-CN', en: 'en', ja: 'ja', fr: 'fr' };

/** github.username 为 site.yaml 必填字段，用户留空时的占位值 */
export const GITHUB_USERNAME_PLACEHOLDER = 'octocat';

/** 可勾选的功能模块 */
export const MODULE_KEYS = ['publications', 'github', 'rss', 'bgm', 'contact'];

/**
 * 解析命令行参数（纯函数）。
 * --example 完整示例；--blank 纯净空白；--yes 非交互默认（完整示例）。
 */
export function parseCliArgs(argv) {
  return {
    example: argv.includes('--example'),
    blank: argv.includes('--blank'),
    yes: argv.includes('--yes'),
  };
}

/** 非交互判定（纯函数）：管道/重定向、CI、或显式参数 */
export function isNonInteractive({ isTTY, env, args }) {
  if (args.example || args.blank || args.yes) return true;
  if (!isTTY) return true;
  if (String(env.CI ?? '').toLowerCase() === 'true') return true;
  return false;
}

/** 判断对象是否为「多语言映射」：plain object 且所有 key 均为已知语言码 */
function isLangMap(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  return keys.length > 0 && keys.every((k) => KNOWN_LANGS.includes(k));
}

/**
 * 递归裁剪多语言映射：只保留选中语言的 key。
 * 裁剪后为空（如选了 en 但该映射只有 ja/fr）时保留首个可用语言兜底，避免空字符串。
 * 返回新对象，不改入参。
 */
export function trimLangMaps(node, langs) {
  if (Array.isArray(node)) return node.map((item) => trimLangMaps(item, langs));
  if (node === null || typeof node !== 'object') return node;
  if (isLangMap(node)) {
    const kept = Object.fromEntries(Object.entries(node).filter(([k]) => langs.includes(k)));
    if (Object.keys(kept).length > 0) return kept;
    const fallback = KNOWN_LANGS.find((k) => k in node);
    return fallback ? { [fallback]: node[fallback] } : {};
  }
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, trimLangMaps(v, langs)]));
}

/**
 * 按向导选项变换 site.yaml 配置对象（纯函数）。
 * options: { nameZh, nameEn, taglineZh, taglineEn, githubUser, langs, modules }
 * modules: { publications, github, rss, bgm, contact }（布尔，true=保留）
 */
export function transformSiteConfig(cfg, options) {
  const { langs, modules } = options;
  const out = trimLangMaps(cfg, langs);

  // 个性化写入（仅写选中语言里存在的 key，避免造出被裁掉的语言）
  if (options.nameZh && langs.includes('zh')) {
    out.site.title.zh = options.nameZh;
    out.profile.name.zh = options.nameZh;
  }
  if (options.nameEn && langs.includes('en')) {
    out.site.title.en = options.nameEn;
    out.profile.name.en = options.nameEn;
  }
  if (options.taglineZh && langs.includes('zh') && out.profile.tagline) {
    out.profile.tagline.zh = options.taglineZh;
  }
  if (options.taglineEn && langs.includes('en') && out.profile.tagline) {
    out.profile.tagline.en = options.taglineEn;
  }

  out.site.language = LANG_TO_SITE_LANGUAGE[langs[0]] ?? langs[0];
  out.github.username = options.githubUser?.trim() || GITHUB_USERNAME_PLACEHOLDER;

  // 模块裁剪（github 段因 validateSiteConfig 必填 username，只收缩不删除）
  if (!modules.github) out.github = { username: out.github.username };
  if (!modules.rss) delete out.rss;
  if (!modules.bgm) delete out.bgm;
  if (!modules.contact) delete out.contact;

  // home.layout 移除被关闭模块的区块
  if (Array.isArray(out.home?.layout)) {
    const removed = new Set();
    if (!modules.github) removed.add('github');
    if (!modules.rss) removed.add('rss');
    if (removed.size > 0) {
      out.home.layout = out.home.layout.filter((item) => !removed.has(item?.block));
    }
  }
  return out;
}

/**
 * 从 Markdown 文本剥离指定叶子指令行（如 :::ghcard{...} / ::publications{...}）。
 * 只匹配独立成行的叶子指令，不动容器围栏。
 */
export function stripModuleDirectives(markdown, names) {
  const re = new RegExp(`^\\s*:{2,4}(?:${names.join('|')})(?:\\{[^\\n]*\\})?\\s*$`);
  return markdown
    .split('\n')
    .filter((line) => !re.test(line))
    .join('\n');
}

/** 完整示例模式：等同旧行为的逐字节全量复制 */
export function copyExampleData(exampleDir, destDir) {
  cpSync(exampleDir, destDir, { recursive: true });
}

/** 删除目录（存在才删） */
function rmIfExists(target) {
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}

/**
 * 快速向导模式：以 data.example 为基底生成裁剪后的个性化 data/。
 * options 同 transformSiteConfig。
 */
export function generateQuickData(options, { exampleDir, destDir }) {
  copyExampleData(exampleDir, destDir);
  const { langs, modules } = options;

  // 语言裁剪：pages/ 与 streaming/ 的语言子目录
  for (const top of ['pages', 'streaming']) {
    const topDir = path.join(destDir, top);
    if (!existsSync(topDir)) continue;
    for (const lang of readdirSync(topDir)) {
      if (!langs.includes(lang)) rmIfExists(path.join(topDir, lang));
    }
  }

  // 模块裁剪：文件与页面指令
  if (!modules.publications) {
    rmIfExists(path.join(destDir, 'publications.yaml'));
    rmIfExists(path.join(destDir, 'publications.bib'));
  }
  if (!modules.rss) rmIfExists(path.join(destDir, 'rss.yaml'));
  const strippedNames = [
    ...(modules.publications ? [] : ['publications']),
    ...(modules.github ? [] : ['ghcard']),
  ];
  if (strippedNames.length > 0) {
    for (const lang of langs) {
      const langDir = path.join(destDir, 'pages', lang);
      if (!existsSync(langDir)) continue;
      for (const file of readdirSync(langDir)) {
        if (!file.endsWith('.md')) continue;
        const filePath = path.join(langDir, file);
        writeFileSync(filePath, stripModuleDirectives(readFileSync(filePath, 'utf8'), strippedNames));
      }
    }
  }

  // site.yaml 变换重写（注释不保留，见 spec 15 §6）
  const sitePath = path.join(destDir, 'site.yaml');
  const cfg = loadYaml(readFileSync(sitePath, 'utf8'));
  writeFileSync(sitePath, dumpYaml(transformSiteConfig(cfg, options), { lineWidth: 120, noRefs: true }));
}

/**
 * 纯净空白模式：最小骨架（不依赖 data.example）。
 * lang 缺省 zh；site.yaml 只含校验必填字段，github.username 用占位符。
 */
export function generateBlankData(destDir, { lang = 'zh', name, githubUser } = {}) {
  const displayName = name?.trim() || (lang === 'zh' ? '我的主页' : 'My Homepage');
  const siteYaml = dumpYaml(
    {
      site: {
        title: { [lang]: displayName },
        language: LANG_TO_SITE_LANGUAGE[lang] ?? lang,
      },
      profile: {
        name: { [lang]: displayName },
      },
      github: { username: githubUser?.trim() || GITHUB_USERNAME_PLACEHOLDER },
    },
    { lineWidth: 120 },
  );
  const indexMd = `---\ntitle: "${displayName}"\nnav: true\norder: 0\n---\n\n${
    lang === 'zh' ? '欢迎使用 OpenHomepage-V2，编辑此页开始你的主页。' : 'Welcome to OpenHomepage-V2 — edit this page to start your homepage.'
  }\n`;
  mkdirSync(path.join(destDir, 'pages', lang), { recursive: true });
  writeFileSync(path.join(destDir, 'site.yaml'), siteYaml);
  writeFileSync(path.join(destDir, 'pages', lang, 'index.md'), indexMd);
}

/**
 * 编排入口：跳过判断 → 参数/非交互分流 → 交互时调用注入的 ask。
 * ask 仅在交互且无参数时调用，签名 ask() → Promise<{ mode: 'quick'|'example'|'blank', options? }>。
 * 返回 { mode: 'skipped' | 'example' | 'blank' | 'quick' }。
 */
export async function runSetup({ rootDir, argv = [], env = {}, isTTY = false, ask } = {}) {
  const exampleDir = path.join(rootDir, 'data.example');
  const destDir = path.join(rootDir, 'data');

  if (existsSync(destDir)) return { mode: 'skipped' };

  const args = parseCliArgs(argv);
  if (isNonInteractive({ isTTY, env, args })) {
    if (args.blank) {
      generateBlankData(destDir);
      return { mode: 'blank' };
    }
    // 非交互默认（无参数 / --yes / --example）回退旧行为：复制完整示例
    copyExampleData(exampleDir, destDir);
    return { mode: 'example' };
  }

  const choice = await ask();
  if (choice.mode === 'blank') {
    generateBlankData(destDir, { lang: choice.options?.lang, name: choice.options?.nameZh || choice.options?.nameEn, githubUser: choice.options?.githubUser });
  } else if (choice.mode === 'quick') {
    generateQuickData(choice.options, { exampleDir, destDir });
  } else {
    copyExampleData(exampleDir, destDir);
  }
  return { mode: choice.mode };
}
