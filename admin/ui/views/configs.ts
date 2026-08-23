/**
 * 配置表单视图：站点 / GitHub / RSS / 流式块 + home.layout 拖拽排序。
 * 全部 1.5s 停顿自动保存（PUT 整份配置，服务端校验失败不落盘并提示）。
 */
import { el, btn, textInput, numberInput, checkbox, select, field, listEditor, rangeInput } from '../dom.ts';
import { api } from '../api.ts';
import { createAutosave, type Autosave } from '../../shared/autosave.ts';
import type { AppState } from '../main.ts';

type Obj = Record<string, unknown>;
type List = Record<string, unknown>[];

function sectionTitle(text: string): HTMLElement {
  return el('h2', { class: 'section-title' }, text);
}

/** 双语文案字段：string | {zh,en} → 双输入框；只填一个时存回纯字符串 */
function localizedField(
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

function makeSaver(state: AppState, saveFn: () => Promise<unknown>): Autosave {
  return createAutosave(1500, () => {
    state.setStatus(state.t('saving'));
    void saveFn()
      .then(() => state.setStatus(state.t('saved'), 'ok'))
      .catch((e: Error) => state.setStatus(`${state.t('saveFailed')}: ${e.message}`, 'err'));
  });
}

// ---------------------------------------------------------------------------
// 站点
// ---------------------------------------------------------------------------

export async function renderSiteConfig(container: HTMLElement, state: AppState): Promise<void> {
  const t = state.t;
  const [{ data }, { assets }] = await Promise.all([api.site(), api.assets()]);
  const cfg = data as Obj;
  cfg.site ??= {};
  cfg.profile ??= {};
  const profile = cfg.profile as Obj;
  profile.links ??= [];
  const bgm = (cfg.bgm ??= {}) as Obj;
  const autosave = makeSaver(state, () => api.saveSite(cfg));
  const touch = () => autosave.touch();

  // BGM 音频文件候选：素材库中的音频扩展名；当前值不在库中时保留显示
  const AUDIO_EXT = /\.(wav|mp3|ogg|m4a|flac)$/i;
  const audioFiles = assets.filter((a) => AUDIO_EXT.test(a.name)).map((a) => `assets/${a.name}`);
  const curBgmFile = String(bgm.file ?? '');
  const bgmFileOptions = [
    { value: '', label: t('bgmFileEmpty') },
    ...(curBgmFile && !audioFiles.includes(curBgmFile)
      ? [{ value: curBgmFile, label: curBgmFile }]
      : []),
    ...audioFiles.map((f) => ({ value: f, label: f })),
  ];
  const bgmVolume = typeof bgm.volume === 'number' ? Math.min(1, Math.max(0, bgm.volume)) : 0.4;

  container.replaceChildren(
    sectionTitle(t('siteSection')),
    el(
      'div',
      { class: 'form-grid' },
      field(t('siteTitle'), textInput(String((cfg.site as Obj).title ?? ''), (v) => { (cfg.site as Obj).title = v; touch(); })),
      field(t('siteDescription'), textInput(String((cfg.site as Obj).description ?? ''), (v) => { (cfg.site as Obj).description = v; touch(); })),
      field(
        t('siteLanguage'),
        select(
          [{ value: 'zh-CN', label: 'zh-CN' }, { value: 'en', label: 'en' }],
          String((cfg.site as Obj).language ?? 'zh-CN'),
          (v) => { (cfg.site as Obj).language = v; touch(); }
        )
      )
    ),
    sectionTitle(t('profileSection')),
    el(
      'div',
      { class: 'form-grid' },
      field(t('profileName'), textInput(String(profile.name ?? ''), (v) => { profile.name = v; touch(); })),
      field(t('profileAvatar'), textInput(String(profile.avatar ?? ''), (v) => { profile.avatar = v; touch(); })),
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
    sectionTitle(t('bgmSection')),
    el(
      'div',
      { class: 'form-grid' },
      field(
        t('bgmEnabled'),
        checkbox(bgm.enabled !== false, (v) => { bgm.enabled = v; touch(); })
      ),
      field(
        t('bgmFile'),
        select(bgmFileOptions, curBgmFile, (v) => { bgm.file = v || undefined; touch(); })
      ),
      field(
        t('bgmVolume'),
        rangeInput(bgmVolume, 0, 1, 0.05, (v) => { bgm.volume = v; touch(); })
      )
    )
  );
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

export async function renderGithubConfig(container: HTMLElement, state: AppState): Promise<void> {
  const t = state.t;
  const { data } = await api.site();
  const cfg = data as Obj;
  const gh = (cfg.github ??= {}) as Obj;
  gh.pinned ??= [];
  const autosave = makeSaver(state, () => api.saveSite(cfg));
  const touch = () => autosave.touch();

  container.replaceChildren(
    sectionTitle(t('configGithub')),
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
    })
  );
}

// ---------------------------------------------------------------------------
// RSS
// ---------------------------------------------------------------------------

export async function renderRssConfig(container: HTMLElement, state: AppState): Promise<void> {
  const t = state.t;
  const [{ data: site }, { data: rssRaw }] = await Promise.all([api.site(), api.rss()]);
  const siteCfg = site as Obj;
  const rss = rssRaw as Obj;
  rss.sources ??= [];
  const siteRss = ((siteCfg.rss ??= {}) as Obj);

  const autosave = makeSaver(state, () =>
    Promise.all([api.saveSite(siteCfg), api.saveRss(rss)]).then(() => undefined)
  );
  const touch = () => autosave.touch();

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

  container.replaceChildren(
    sectionTitle(t('configRss')),
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
    sourcesWrap
  );
}

// ---------------------------------------------------------------------------
// 流式块 + home.layout 拖拽排序
// ---------------------------------------------------------------------------

const LAYOUT_BLOCK_LABELS: Record<string, string> = {
  profile: '👤 profile',
  markdown: '📝 markdown',
  streaming: '💬 streaming',
  github: '🐙 github',
  rss: '📰 rss',
};

export async function renderStreamingConfig(container: HTMLElement, state: AppState): Promise<void> {
  const t = state.t;
  const { data } = await api.site();
  const cfg = data as Obj;
  cfg.streaming_blocks ??= [];
  const home = (cfg.home ??= {}) as Obj;
  home.layout ??= [];
  const autosave = makeSaver(state, () => api.saveSite(cfg));
  const touch = () => autosave.touch();

  // ---- home.layout 拖拽排序器（HTML5 drag & drop）----
  const layoutWrap = el('div', { class: 'layout-sorter' });
  const renderLayout = () => {
    const layout = home.layout as List;
    const rows = layout.map((blk, i) => {
      const label = LAYOUT_BLOCK_LABELS[String(blk.block)] ?? String(blk.block);
      const row = el(
        'div',
        { class: 'layout-row', draggable: 'true' },
        el('span', { class: 'drag-handle' }, '⋮⋮'),
        el('span', {}, blk.block === 'streaming' ? `${label} (${String(blk.id ?? '')})` : label),
        btn(t('remove'), () => {
          layout.splice(i, 1);
          touch();
          renderLayout();
        }, 'btn-danger')
      );
      row.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData('text/plain', String(i));
        row.classList.add('dragging');
      });
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
      row.addEventListener('dragover', (e) => e.preventDefault());
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = Number(e.dataTransfer?.getData('text/plain'));
        if (!Number.isInteger(from) || from === i) return;
        const [moved] = layout.splice(from, 1);
        layout.splice(i, 0, moved);
        touch();
        renderLayout();
      });
      return row;
    });
    // 追加块：可选 block 类型 + streaming id
    const addSel = select(
      Object.entries(LAYOUT_BLOCK_LABELS).map(([value, label]) => ({ value, label })),
      'profile',
      () => undefined
    );
    const idInput = textInput('', () => undefined, 'streaming id');
    rows.push(
      el(
        'div',
        { class: 'layout-add' },
        addSel,
        idInput,
        btn(t('addLayoutBlock'), () => {
          const blk: Obj = { block: addSel.value };
          if (addSel.value === 'streaming') blk.id = idInput.value || 'welcome';
          layout.push(blk);
          touch();
          renderLayout();
        })
      )
    );
    layoutWrap.replaceChildren(...rows);
  };
  renderLayout();

  container.replaceChildren(
    sectionTitle(t('streamingBlocks')),
    listEditor({
      items: cfg.streaming_blocks as List,
      renderRow: (blk) =>
        el(
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
        ),
      onChange: touch,
      makeNew: () => ({ id: '', title: '', content_file: 'streaming/zh/welcome.md', autoplay: true, speed: 40 }),
      addLabel: t('addBlock'),
      t,
    }),
    sectionTitle(t('homeLayout')),
    el('p', { class: 'muted' }, t('homeLayoutHint')),
    layoutWrap
  );
}
