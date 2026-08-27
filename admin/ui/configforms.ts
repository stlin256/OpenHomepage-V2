/**
 * 配置表单段构建器（M12d 抽取，docs/specs/12 §2.3）：admin 配置视图（views/configs.ts，
 * 1.5s 停顿自动保存）与可视化编辑 overlay 检查器（保存按钮 + 成功后整页刷新，§2.6）共用，
 * 避免两份实现漂移。构建器直接改写传入的配置对象，变更经 deps.touch 通知调用方
 * （admin 接 autosave.touch；overlay 传 noop，保存按钮统一 PUT 全量）。
 * DOM 结构/class 与原 views/configs.ts 内联实现保持一致（admin 样式 styles.css；
 * overlay 侧由 overlay.css 在 .oh-inspector 作用域内做深色浮层适配）。
 */
import { el, textInput, numberInput, checkbox, select, field, listEditor } from './dom.ts';

export type Obj = Record<string, unknown>;
export type List = Record<string, unknown>[];

export interface CfgFormDeps {
  t: (k: string) => string;
  /** 字段变化回调（admin：autosave.touch；overlay：noop，保存时整体提交） */
  touch: () => void;
  /** 素材引用列表（assets/<name>；头像等下拉候选，缺省时降级为文本输入） */
  assets?: string[];
}

/** 双语文案字段：string | {zh,en} → 双输入框；只填一个时存回纯字符串 */
export function localizedField(
  value: unknown,
  labelZh: string,
  labelEn: string,
  onChange: (v: unknown) => void
): HTMLElement {
  const cur: { zh: string; en: string } =
    typeof value === 'string'
      ? { zh: value, en: '' }
      : { zh: String((value as Obj)?.zh ?? ''), en: String((value as Obj)?.en ?? '') };
  const commit = () => {
    if (cur.zh && cur.en) onChange({ zh: cur.zh, en: cur.en });
    else onChange(cur.zh || cur.en);
  };
  return el(
    'div',
    { class: 'localized' },
    field(labelZh, textInput(cur.zh, (v) => { cur.zh = v; commit(); })),
    field(labelEn, textInput(cur.en, (v) => { cur.en = v; commit(); }))
  );
}

/** 素材引用下拉：空项 + 当前值（不在素材列表时保留，如外链）+ 素材列表；无素材列表时降级文本输入 */
export function assetInput(
  value: string,
  assets: string[] | undefined,
  onChange: (v: string) => void,
  emptyLabel: string
): HTMLElement {
  if (!assets || assets.length === 0) return textInput(value, onChange);
  const options = [
    { value: '', label: emptyLabel },
    ...(value !== '' && !assets.includes(value) ? [{ value, label: value }] : []),
    ...assets.map((a) => ({ value: a, label: a })),
  ];
  return select(options, value, onChange);
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

/** 个人资料段（site.profile）：昵称/头像/头像位置/简介页/一句话介绍/社交链接 */
export function buildProfileForm(profile: Obj, deps: CfgFormDeps): HTMLElement[] {
  const { t, touch } = deps;
  profile.links ??= [];
  const avatarAssets = (deps.assets ?? []).filter((a) => IMAGE_EXT.test(a));
  return [
    localizedField(profile.name, t('profileNameZh'), t('profileNameEn'), (v) => { profile.name = v; touch(); }),
    el(
      'div',
      { class: 'form-grid' },
      field(t('profileAvatar'), assetInput(String(profile.avatar ?? ''), avatarAssets, (v) => { profile.avatar = v; touch(); }, t('assetRefEmpty'))),
      field(
        t('avatarPosition'),
        select(
          [
            { value: 'side', label: t('avatarPosSide') },
            { value: 'top', label: t('avatarPosTop') },
          ],
          String(profile.avatar_position ?? 'side'),
          (v) => { profile.avatar_position = v; touch(); }
        )
      ),
      field(t('profileBioPage'), textInput(String(profile.bio_page ?? ''), (v) => { profile.bio_page = v; touch(); }))
    ),
    localizedField(profile.tagline, t('profileTaglineZh'), t('profileTaglineEn'), (v) => { profile.tagline = v; touch(); }),
    el('h3', {}, t('profileLinks')),
    listEditor({
      items: profile.links as List,
      renderRow: (link) =>
        el(
          'div',
          { class: 'row-fields' },
          textInput(String(link.label ?? ''), (v) => { link.label = v; touch(); }),
          textInput(String(link.url ?? ''), (v) => { link.url = v; touch(); })
        ),
      onChange: touch,
      makeNew: () => ({ label: '', url: '' }),
      addLabel: t('addLink'),
      t,
    }),
  ];
}

/** GitHub 段（site.github）：用户名/贡献热力图开关/置顶仓库列表 */
export function buildGithubForm(gh: Obj, deps: CfgFormDeps): HTMLElement[] {
  const { t, touch } = deps;
  gh.pinned ??= [];
  return [
    el(
      'div',
      { class: 'form-grid' },
      field(t('githubUsername'), textInput(String(gh.username ?? ''), (v) => { gh.username = v; touch(); })),
      field(t('githubShowContributions'), checkbox(Boolean(gh.show_contributions), (v) => { gh.show_contributions = v; touch(); }))
    ),
    el('h3', {}, t('githubPinned')),
    listEditor({
      items: gh.pinned as List,
      renderRow: (p) =>
        el(
          'div',
          { class: 'row-fields' },
          textInput(String(p.repo ?? ''), (v) => { p.repo = v; touch(); }),
          textInput(String(p.note ?? ''), (v) => { p.note = v; touch(); })
        ),
      onChange: touch,
      makeNew: () => ({ repo: '', note: '' }),
      addLabel: t('addRepo'),
      t,
    }),
  ];
}

/** RSS 段：site.rss（启用/区块标题/源文件名）+ rss.yaml（展示模式/订阅源，含精选文章子列表） */
export function buildRssForm(siteRss: Obj, rss: Obj, deps: CfgFormDeps): HTMLElement[] {
  const { t, touch } = deps;
  rss.sources ??= [];

  const sourcesWrap = el('div', {});
  const renderSources = () => {
    sourcesWrap.replaceChildren(
      listEditor({
        items: rss.sources as List,
        renderRow: (src) => {
          const row = el(
            'div',
            { class: 'source-card' },
            el(
              'div',
              { class: 'row-fields' },
              field(t('sourceName'), textInput(String(src.name ?? ''), (v) => { src.name = v; touch(); })),
              field(t('sourceUrl'), textInput(String(src.url ?? ''), (v) => { src.url = v; touch(); })),
              field(
                t('sourceMode'),
                select(
                  [{ value: 'latest', label: t('modeLatest') }, { value: 'curated', label: t('modeCurated') }],
                  String(src.mode ?? 'latest'),
                  (v) => { src.mode = v; touch(); renderSources(); }
                )
              ),
              field(t('sourceLatest'), numberInput(src.latest as number | undefined, (v) => { src.latest = v; touch(); })),
              field(t('sourceWeight'), numberInput(src.weight as number | undefined, (v) => { src.weight = v; touch(); })),
              field(t('sourceCover'), textInput(String(src.cover ?? ''), (v) => { src.cover = v; touch(); }))
            )
          );
          if (src.mode === 'curated') {
            src.articles ??= [];
            row.append(
              el('h4', {}, t('sourceArticles')),
              listEditor({
                items: src.articles as List,
                renderRow: (a) =>
                  el(
                    'div',
                    { class: 'row-fields' },
                    textInput(String(a.url ?? ''), (v) => { a.url = v; touch(); }),
                    textInput(String(a.note ?? ''), (v) => { a.note = v; touch(); }),
                    textInput(String(a.cover ?? ''), (v) => { a.cover = v; touch(); })
                  ),
                onChange: touch,
                makeNew: () => ({ url: '', note: '' }),
                addLabel: t('addArticle'),
                t,
              })
            );
          }
          return row;
        },
        onChange: touch,
        makeNew: () => ({ name: '', url: '', mode: 'latest', latest: 5 }),
        addLabel: t('addSource'),
        t,
      })
    );
  };
  renderSources();

  return [
    el(
      'div',
      { class: 'form-grid' },
      field(t('rssEnabled'), checkbox(Boolean(siteRss.enabled ?? true), (v) => { siteRss.enabled = v; touch(); })),
      field(t('rssSourcesFile'), textInput(String(siteRss.sources_file ?? 'rss.yaml'), (v) => { siteRss.sources_file = v; touch(); })),
      field(
        t('rssDisplay'),
        select(
          [{ value: 'grouped', label: t('displayGrouped') }, { value: 'mixed', label: t('displayMixed') }],
          String(rss.display ?? 'grouped'),
          (v) => { rss.display = v; touch(); }
        )
      )
    ),
    localizedField(siteRss.block_title, t('rssBlockTitleZh'), t('rssBlockTitleEn'), (v) => { siteRss.block_title = v; touch(); }),
    el('h3', {}, t('rssSources')),
    sourcesWrap,
  ];
}

/** 单个流式块定义的字段卡（site.streaming_blocks 元素；admin 列表行与 overlay 单块表单共用） */
export function buildStreamingBlockCard(blk: Obj, deps: CfgFormDeps): HTMLElement {
  const { t, touch } = deps;
  return el(
    'div',
    { class: 'source-card' },
    el(
      'div',
      { class: 'row-fields' },
      field(t('blockId'), textInput(String(blk.id ?? ''), (v) => { blk.id = v; touch(); })),
      field(t('blockContentFile'), textInput(String(blk.content_file ?? ''), (v) => { blk.content_file = v; touch(); })),
      field(t('blockAutoplay'), checkbox(Boolean(blk.autoplay), (v) => { blk.autoplay = v; touch(); })),
      field(t('blockSpeed'), numberInput(blk.speed as number | undefined, (v) => { blk.speed = v; touch(); }))
    ),
    localizedField(blk.title, t('blockTitleZh'), t('blockTitleEn'), (v) => { blk.title = v; touch(); })
  );
}

/**
 * 单个编辑区块的主字段（id/强调色/分割线 + tag/title/description 双语）。
 * 组件列表（actions/list/tiles/archive）不在内：admin 视图在此基础上追加子面板，
 * overlay 检查器提供「在后台编辑」深链（完整移植成本过高，M12d 只覆盖主字段）。
 */
export function buildEditorialMainFields(block: Obj, deps: CfgFormDeps): HTMLElement {
  const { t, touch } = deps;
  return el(
    'div',
    { class: 'source-card' },
    el(
      'div',
      { class: 'row-fields' },
      field(t('blockId'), textInput(String(block.id ?? ''), (v) => { block.id = v; touch(); })),
      field(t('editorialColor'), textInput(String(block.color ?? ''), (v) => {
        block.color = v || undefined;
        touch();
      }, '#7b9aac')),
      field(t('editorialDivider'), checkbox(Boolean(block.divider), (v) => { block.divider = v; touch(); }))
    ),
    localizedField(block.tag, t('tagZh'), t('tagEn'), (v) => { block.tag = v; touch(); }),
    localizedField(block.title, t('titleZh'), t('titleEn'), (v) => { block.title = v; touch(); }),
    localizedField(block.description, t('descriptionZh'), t('descriptionEn'), (v) => { block.description = v; touch(); })
  );
}
