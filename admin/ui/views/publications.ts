/**
 * 学术成果视图（spec 18）：BibTeX 导入面板。
 * 粘贴 BibTeX 文本或选择 .bib 文件 → 「解析预览」列出将新增/将跳过的条目 →
 * 「确认导入」合并进 publications.yaml（服务端自动快照，bibtex_file 存在时同步追加 .bib）。
 */
import { el, btn } from '../dom.ts';
import { api, type ImportedPub } from '../api.ts';
import type { AppState } from '../main.ts';

export function renderPublicationsImport(container: HTMLElement, state: AppState): void {
  const t = state.t;

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
      ops.append(
        btn(t('bibImportConfirm'), () => void doImport(), 'btn-primary')
      );
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
    } catch (e) {
      state.setStatus((e as Error).message, 'err');
    }
  };

  container.replaceChildren(
    el('h2', { class: 'section-title' }, t('configPublications')),
    el('p', { class: 'muted' }, t('bibImportHint')),
    fileInput,
    textarea,
    el('div', { class: 'modal-ops' }, btn(t('bibPreview'), () => void doPreview(), 'btn-primary')),
    previewWrap
  );
}
