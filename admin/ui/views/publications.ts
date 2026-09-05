/**
 * 学术成果视图：条目管理（spec 21 §4）+ BibTeX 导入面板（spec 18）。
 * - 条目管理：列表 + 新增/编辑/删除表单（弹窗），整文件 PUT 保存
 *   （服务端逐条校验 + 自动快照，同 configs 保存链路）；未知字段（如 doi）编辑往返不丢；
 * - BibTeX 导入：粘贴文本或选择 .bib 文件 → 「解析预览」列出将新增/将跳过的条目 →
 *   「确认导入」合并进 publications.yaml（服务端自动快照，bibtex_file 存在时同步追加 .bib）。
 */
import { el, btn } from '../dom.ts';
import {
  api,
  type ImportedPub,
  type PubItem,
  type PublicationsData,
} from '../api.ts';
import type { AppState } from '../main.ts';

const PUB_TYPES = ['conference', 'journal', 'workshop', 'demo', 'preprint', 'thesis'] as const;
const LINK_KEYS = ['pdf', 'code', 'project', 'slides', 'dataset'] as const;

/** 逗号分隔 ⇄ 字符串数组 */
function splitList(text: string): string[] {
  return text
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 从标题派生条目 id（小写、非 [a-z0-9] 折叠为 -；与现有 id 冲突时追加 -2/-3） */
function deriveId(title: string, used: Set<string>): string {
  let base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!base) base = 'pub';
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** 多语言字段（note/abstract）：字符串或 {zh,en} 对象 → [zh, en] */
function localizedPair(v: unknown): [string, string] {
  if (typeof v === 'string') return [v, ''];
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return [typeof o.zh === 'string' ? o.zh : '', typeof o.en === 'string' ? o.en : ''];
  }
  return ['', ''];
}

export async function renderPublications(container: HTMLElement, state: AppState): Promise<void> {
  const t = state.t;

  let cfg: PublicationsData;
  try {
    cfg = (await api.publications()).data;
  } catch (e) {
    container.replaceChildren(
      el('div', { class: 'error-box' }, `${t('loadFailed')}: ${(e as Error).message}`)
    );
    return;
  }
  if (!Array.isArray(cfg.items)) cfg.items = [];

  const listWrap = el('div', {});

  const save = async (next: PublicationsData) => {
    await api.savePublications(next);
    cfg = next;
    state.setStatus(t('pubSaved'), 'ok');
    renderList();
  };

  // ---- 条目表单弹窗（新增/编辑共用）：克隆原条目只覆盖已知键，保留 doi 等未知字段 ----
  const openForm = (index: number | null) => {
    const original: PubItem = index === null ? {} : { ...cfg.items[index] };
    const links = (original.links ?? {}) as Record<string, string>;
    const [noteZh, noteEn] = localizedPair(original.note);
    const [absZh, absEn] = localizedPair(original.abstract);

    const field = (label: string, value: string | number | undefined) => {
      const input = el('input', { type: 'text', class: 'input' }) as HTMLInputElement;
      input.value = value === undefined || value === null ? '' : String(value);
      return { label: el('label', { class: 'field' }, el('span', { class: 'field-label' }, label), input), input };
    };

    const fId = field(t('pubFieldId'), original.id);
    const fTitle = field(t('pubFieldTitle'), original.title);
    const fAuthors = field(t('pubFieldAuthors'), (original.authors ?? []).join(', '));
    const fYear = field(t('pubFieldYear'), original.year);
    const fDate = field(t('pubFieldDate'), original.date);
    const typeSel = el('select', { class: 'input' }) as HTMLSelectElement;
    for (const ty of PUB_TYPES) typeSel.append(el('option', { value: ty }, ty));
    typeSel.value = original.type && (PUB_TYPES as readonly string[]).includes(original.type) ? original.type : 'conference';
    const fVenue = field(t('pubFieldVenue'), original.venue);
    const fVenueShort = field(t('pubFieldVenueShort'), original.venue_short);
    const fTags = field(t('pubFieldTags'), (original.tags ?? []).join(', '));
    const fBadges = field(t('pubFieldBadges'), (original.badges ?? []).join(', '));
    const fNoteZh = field(t('pubFieldNoteZh'), noteZh);
    const fNoteEn = field(t('pubFieldNoteEn'), noteEn);
    const fAbsZh = field(t('pubFieldAbstractZh'), absZh);
    const fAbsEn = field(t('pubFieldAbstractEn'), absEn);
    const linkInputs = LINK_KEYS.map((k) => ({ key: k, ...field(k, links[k]) }));
    const fBibtexKey = field(t('pubFieldBibtexKey'), original.bibtex_key);
    const fTeaser = field(t('pubFieldTeaser'), original.teaser);
    const fOrder = field(t('pubFieldOrder'), original.order);
    const error = el('div', { class: 'form-error' });

    const overlay = el('div', { class: 'modal-overlay' });
    const close = () => overlay.remove();

    const submit = async () => {
      error.textContent = '';
      const title = fTitle.input.value.trim();
      const authors = splitList(fAuthors.input.value);
      const year = Number.parseInt(fYear.input.value.trim(), 10);
      const venue = fVenue.input.value.trim();
      if (!title) { error.textContent = t('pubFieldTitle'); return; }
      if (!authors.length) { error.textContent = t('pubFieldAuthors'); return; }
      if (!Number.isInteger(year)) { error.textContent = t('pubFieldYear'); return; }
      if (!venue) { error.textContent = t('pubFieldVenue'); return; }

      const item: PubItem = { ...original, title, authors, year, venue, type: typeSel.value };
      // 可选字段：空值删除键（保持 YAML 干净），非空覆盖
      const setStr = (key: keyof PubItem, v: string) => {
        if (v.trim()) (item as Record<string, unknown>)[key] = v.trim();
        else delete (item as Record<string, unknown>)[key];
      };
      const usedIds = new Set(
        cfg.items.map((x, i) => (i === index ? '' : String(x.id ?? ''))).filter(Boolean)
      );
      const idText = fId.input.value.trim() || deriveId(title, usedIds);
      if (usedIds.has(idText)) {
        error.textContent = `${t('pubFieldId')}: ${idText}`;
        return;
      }
      item.id = idText;
      setStr('date', fDate.input.value);
      setStr('venue_short', fVenueShort.input.value);
      setStr('bibtex_key', fBibtexKey.input.value);
      setStr('teaser', fTeaser.input.value);
      const tags = splitList(fTags.input.value);
      if (tags.length) item.tags = tags;
      else delete item.tags;
      const badges = splitList(fBadges.input.value);
      if (badges.length) item.badges = badges;
      else delete item.badges;
      const orderText = fOrder.input.value.trim();
      if (orderText && Number.isFinite(Number(orderText))) item.order = Number(orderText);
      else delete item.order;
      if (fNoteZh.input.value.trim() || fNoteEn.input.value.trim()) {
        const note: Record<string, string> = {};
        if (fNoteZh.input.value.trim()) note.zh = fNoteZh.input.value.trim();
        if (fNoteEn.input.value.trim()) note.en = fNoteEn.input.value.trim();
        item.note = note;
      } else delete item.note;
      if (fAbsZh.input.value.trim() || fAbsEn.input.value.trim()) {
        const abs: Record<string, string> = {};
        if (fAbsZh.input.value.trim()) abs.zh = fAbsZh.input.value.trim();
        if (fAbsEn.input.value.trim()) abs.en = fAbsEn.input.value.trim();
        item.abstract = abs;
      } else delete item.abstract;
      const newLinks: Record<string, string> = {};
      for (const { key, input } of linkInputs) {
        if (input.value.trim()) newLinks[key] = input.value.trim();
      }
      if (Object.keys(newLinks).length) item.links = newLinks;
      else delete item.links;

      const items = [...cfg.items];
      if (index === null) items.push(item);
      else items[index] = item;
      try {
        await save({ ...cfg, items });
        close();
      } catch (e) {
        error.textContent = (e as Error).message;
      }
    };

    overlay.append(
      el(
        'div',
        { class: 'modal pub-form-modal' },
        el('h3', {}, index === null ? t('pubAddTitle') : t('pubEditTitle')),
        fId.label,
        fTitle.label,
        fAuthors.label,
        el(
          'div',
          { class: 'pub-form-row' },
          fYear.label,
          fDate.label,
          el('label', { class: 'field' }, el('span', { class: 'field-label' }, t('pubFieldType')), typeSel)
        ),
        fVenue.label,
        fVenueShort.label,
        fTags.label,
        fBadges.label,
        fNoteZh.label,
        fNoteEn.label,
        fAbsZh.label,
        fAbsEn.label,
        el('div', { class: 'field-label pub-links-label' }, t('pubFieldLinks')),
        ...linkInputs.map((x) => x.label),
        fBibtexKey.label,
        fTeaser.label,
        fOrder.label,
        error,
        el(
          'div',
          { class: 'modal-ops' },
          btn(t('save'), () => void submit(), 'btn-primary'),
          btn(t('cancel'), close)
        )
      )
    );
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    document.body.append(overlay);
    fTitle.input.focus();
  };

  const renderList = () => {
    const rows = cfg.items.map((item, i) =>
      el(
        'div',
        { class: 'pub-row' },
        el(
          'div',
          { class: 'pub-row-main' },
          el('strong', {}, String(item.title ?? item.id ?? '')),
          el(
            'span',
            { class: 'muted' },
            ` — ${String(item.venue ?? '')} · ${String(item.year ?? '')} · ${String(item.type ?? '')}`
          )
        ),
        btn(t('edit'), () => openForm(i)),
        btn(t('remove'), () => {
          if (!confirm(t('pubDeleteConfirm'))) return;
          const items = cfg.items.filter((_, j) => j !== i);
          void save({ ...cfg, items }).catch((e) => state.setStatus((e as Error).message, 'err'));
        })
      )
    );
    listWrap.replaceChildren(
      el('h3', { class: 'section-title' }, t('pubManageSection')),
      ...(rows.length ? rows : [el('p', { class: 'muted' }, t('pubEmpty'))]),
      el('div', { class: 'modal-ops' }, btn(t('pubAdd'), () => openForm(null), 'btn-primary'))
    );
  };
  renderList();

  // ---- BibTeX 导入面板（spec 18，原样保留在条目管理下方） ----
  const textarea = el('textarea', {
    class: 'input bib-input',
    rows: '10',
    placeholder: t('bibPlaceholder'),
  }) as HTMLTextAreaElement;

  const fileInput = el('input', { type: 'file', accept: '.bib,text/plain' }) as HTMLInputElement;
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    void f.text().then((text) => {
      textarea.value = text;
      state.setStatus(t('bibFileLoaded'), 'ok');
    });
  });

  const previewWrap = el('div', {});

  const renderPreview = (added: ImportedPub[], skipped: { key: string; reason: string }[]) => {
    const parts: HTMLElement[] = [];
    if (added.length) {
      parts.push(
        el('h3', { class: 'section-title' }, t('bibPreviewAdded').replace('{0}', String(added.length))),
        el(
          'ul',
          { class: 'bib-preview-list' },
          ...added.map((item) =>
            el(
              'li',
              {},
              el('strong', {}, item.title),
              el('span', { class: 'muted' }, ` — ${item.venue} · ${item.year} · ${item.type}`)
            )
          )
        )
      );
    }
    if (skipped.length) {
      parts.push(
        el('h3', { class: 'section-title' }, t('bibPreviewSkipped').replace('{0}', String(skipped.length))),
        el(
          'ul',
          { class: 'bib-preview-list' },
          ...skipped.map((s) =>
            el('li', {}, el('code', {}, s.key), el('span', { class: 'muted' }, ` — ${s.reason}`))
          )
        )
      );
    }
    const ops = el('div', { class: 'modal-ops' });
    if (added.length) {
      ops.append(btn(t('bibImportConfirm'), () => void doImport(), 'btn-primary'));
    }
    parts.push(ops);
    previewWrap.replaceChildren(...parts);
  };

  const doPreview = async () => {
    try {
      state.setStatus(t('bibParsing'));
      const r = await api.previewBibtex(textarea.value);
      renderPreview(r.added, r.skipped);
      state.setStatus(t('bibPreviewDone'), 'ok');
    } catch (e) {
      previewWrap.replaceChildren();
      state.setStatus((e as Error).message, 'err');
    }
  };

  const doImport = async () => {
    try {
      const r = await api.importBibtex(textarea.value);
      previewWrap.replaceChildren();
      textarea.value = '';
      state.setStatus(
        t('bibImportDone').replace('{0}', String(r.added)).replace('{1}', String(r.skipped.length)),
        'ok'
      );
      // 导入后刷新条目列表
      cfg = (await api.publications()).data;
      if (!Array.isArray(cfg.items)) cfg.items = [];
      renderList();
    } catch (e) {
      state.setStatus((e as Error).message, 'err');
    }
  };

  container.replaceChildren(
    el('h2', { class: 'section-title' }, t('configPublications')),
    listWrap,
    el('h3', { class: 'section-title pub-bib-title' }, t('bibImportSection')),
    el('p', { class: 'muted' }, t('bibImportHint')),
    fileInput,
    textarea,
    el('div', { class: 'modal-ops' }, btn(t('bibPreview'), () => void doPreview(), 'btn-primary')),
    previewWrap
  );
}
