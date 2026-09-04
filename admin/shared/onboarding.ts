/**
 * 新手欢迎向导（spec 19）的纯逻辑：个人名片写入、首页模块勾选、主题色盘。
 * 全部操作直接改写传入的 site.yaml 配置对象（不写盘），
 * 落盘统一走既有 PUT /api/config/site（schema 校验 + 快照）链路。
 * 无 DOM / Node 依赖，前端向导视图与单测共用。
 */
import { normalizeHex } from './color.ts';

export type Obj = Record<string, unknown>;

/** 首页可编排模块：key 形如 'profile' / 'streaming:welcome' / 'editorial:work' */
export interface ModuleCandidate {
  key: string;
  /** site.yaml home.layout 的 block 值 */
  block: string;
  /** streaming/editorial 区块的 id（固定区块无 id） */
  id?: string;
}

/** 固定区块的规范顺序（streaming/editorial 按定义序插在 profile 之后、markdown 之前） */
const FIXED_BLOCKS_BEFORE = ['profile'];
const FIXED_BLOCKS_AFTER = ['markdown', 'github', 'rss'];

function layoutEntries(cfg: Obj): { block: string; id?: string }[] {
  const home = cfg.home as Obj | undefined;
  return Array.isArray(home?.layout) ? (home.layout as { block: string; id?: string }[]) : [];
}

function entryKey(e: { block: string; id?: string }): string {
  return e.id ? `${e.block}:${e.id}` : e.block;
}

/**
 * 列出全部可勾选模块：固定区块 + streaming_blocks / editorial_blocks 里已定义的区块。
 * 顺序即重新勾选时的落位顺序（profile → streaming/editorial → markdown → github → rss）。
 */
export function listModuleCandidates(cfg: Obj): ModuleCandidate[] {
  const out: ModuleCandidate[] = FIXED_BLOCKS_BEFORE.map((block) => ({ key: block, block }));
  const streaming = Array.isArray(cfg.streaming_blocks) ? (cfg.streaming_blocks as Obj[]) : [];
  for (const b of streaming) {
    if (typeof b.id === 'string' && b.id) out.push({ key: `streaming:${b.id}`, block: 'streaming', id: b.id });
  }
  const editorial = Array.isArray(cfg.editorial_blocks) ? (cfg.editorial_blocks as Obj[]) : [];
  for (const b of editorial) {
    if (typeof b.id === 'string' && b.id) out.push({ key: `editorial:${b.id}`, block: 'editorial', id: b.id });
  }
  out.push(...FIXED_BLOCKS_AFTER.map((block) => ({ key: block, block })));
  return out;
}

/** 当前 home.layout 中已挂载的模块 key 集合 */
export function enabledModuleKeys(cfg: Obj): string[] {
  return layoutEntries(cfg).map(entryKey);
}

/**
 * 按勾选结果重建 home.layout：未勾选的条目移除，新勾选的按候选规范顺序落位。
 * 引用已不存在定义（streaming/editorial id 被删）的 key 直接忽略。
 * 勾选结果为空时保留原有 layout 不动（防止误清空首页）。
 */
export function applyModuleSelection(cfg: Obj, enabledKeys: string[]): void {
  if (enabledKeys.length === 0) return;
  const enabled = new Set(enabledKeys);
  // 原 layout 中不在候选表里的未知条目：已挂载的保留（不丢用户自定义），位置排在最后
  const candidates = listModuleCandidates(cfg);
  const candidateKeys = new Set(candidates.map((c) => c.key));
  const layout: { block: string; id?: string }[] = [];
  for (const c of candidates) {
    if (!enabled.has(c.key)) continue;
    layout.push(c.id ? { block: c.block, id: c.id } : { block: c.block });
  }
  for (const e of layoutEntries(cfg)) {
    const key = entryKey(e);
    if (!candidateKeys.has(key) && enabled.has(key)) layout.push({ ...e });
  }
  const home = (cfg.home ??= {}) as Obj;
  home.layout = layout;
}

/** BGM / 右下联系卡的启用开关（对应 site.yaml 的 bgm.enabled / contact.intro_card.enabled） */
export function applyFeatureToggles(
  cfg: Obj,
  toggles: { bgmEnabled?: boolean; contactEnabled?: boolean }
): void {
  if (toggles.bgmEnabled !== undefined) {
    const bgm = (cfg.bgm ??= {}) as Obj;
    bgm.enabled = toggles.bgmEnabled;
  }
  if (toggles.contactEnabled !== undefined) {
    const contact = (cfg.contact ??= {}) as Obj;
    const card = (contact.intro_card ??= {}) as Obj;
    card.enabled = toggles.contactEnabled;
  }
}

/**
 * 个人名片写入：profile.name / profile.tagline / github.username。
 * 多语言字段沿用 localizedField 语义：zh/en 双值存对象（保留 ja/fr 等其他语言键），
 * 只填一个时存纯字符串。留空的字段不动；GitHub 用户名去空白后为空则不改。
 */
export function applyOnboardingProfile(
  cfg: Obj,
  input: { nameZh?: string; nameEn?: string; taglineZh?: string; taglineEn?: string; githubUsername?: string }
): void {
  const writeLocalized = (holder: Obj, field: string, zh: string, en: string): void => {
    if (!zh && !en) return; // 双空视为未填写，保留原值
    const cur = holder[field];
    const rest: Obj = cur && typeof cur === 'object' && !Array.isArray(cur) ? { ...(cur as Obj) } : {};
    delete rest.zh;
    delete rest.en;
    holder[field] = {
      ...(zh ? { zh } : {}),
      ...(en ? { en } : {}),
      ...rest,
    };
  };
  const profile = (cfg.profile ??= {}) as Obj;
  writeLocalized(profile, 'name', (input.nameZh ?? '').trim(), (input.nameEn ?? '').trim());
  writeLocalized(profile, 'tagline', (input.taglineZh ?? '').trim(), (input.taglineEn ?? '').trim());
  const username = (input.githubUsername ?? '').trim();
  if (username) {
    const github = (cfg.github ??= {}) as Obj;
    github.username = username;
  }
}

/** 主题色盘预设（accent 候选；第一色为默认主题色） */
export const ACCENT_PRESETS = ['#3a7bd5', '#0f766e', '#2f7d4f', '#c2611f', '#c0392b', '#7c5cbf'];

/** GitHub 预填（GET /api/github/prefill）返回的名片字段；上游 null 统一归一为空串 */
export interface GithubPrefillData {
  name: string;
  bio: string;
  blog: string;
  avatarUrl: string;
  htmlUrl: string;
}

/** 名片表单四个多语言输入框的当前值 */
export interface ProfileFormState {
  nameZh: string;
  nameEn: string;
  taglineZh: string;
  taglineEn: string;
}

/**
 * GitHub 预填的字段填充策略（spec 19 §3.1）：
 * 仅对「当前为空」或「用户尚未手改过」的字段给出建议值，用户已输入的内容一律不覆盖；
 * GitHub 的 name/bio 无语言维度，zh/en 两侧按同一策略各自判定。
 */
export function githubPrefillSuggestions(
  current: ProfileFormState,
  touched: Record<keyof ProfileFormState, boolean>,
  gh: Pick<GithubPrefillData, 'name' | 'bio'>
): Partial<ProfileFormState> {
  const fillable = (key: keyof ProfileFormState): boolean => !current[key].trim() || !touched[key];
  const out: Partial<ProfileFormState> = {};
  const name = gh.name.trim();
  if (name) {
    if (fillable('nameZh')) out.nameZh = name;
    if (fillable('nameEn')) out.nameEn = name;
  }
  const bio = gh.bio.trim();
  if (bio) {
    if (fillable('taglineZh')) out.taglineZh = bio;
    if (fillable('taglineEn')) out.taglineEn = bio;
  }
  return out;
}

/**
 * 把 GitHub 的 blog 主页链接并入 profile.links（site.yaml 的社交链接字段）：
 * 无 scheme 的裸域名补 https://；已有同 URL（忽略大小写与末尾斜杠）的链接则不重复添加。
 * blog 为空时不动配置。返回是否产生改动（供调用方置 dirty）。
 */
export function applyGithubBlogLink(cfg: Obj, blog: string): boolean {
  const raw = blog.trim();
  if (!raw) return false;
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const canon = (u: string): string => u.trim().toLowerCase().replace(/\/+$/, '');
  const profile = (cfg.profile ??= {}) as Obj;
  const links = Array.isArray(profile.links) ? (profile.links as Obj[]) : [];
  if (links.some((l) => typeof l?.url === 'string' && canon(l.url) === canon(url))) return false;
  profile.links = [...links, { label: 'Website', url }];
  return true;
}

/** 应用预设强调色到 theme.accent（复用取色器的 normalizeHex）；非法 hex 返回 false 且不改配置 */
export function applyAccent(cfg: Obj, hex: string): boolean {
  const norm = normalizeHex(hex);
  if (!norm) return false;
  const theme = (cfg.theme ??= {}) as Obj;
  theme.accent = norm;
  return true;
}
