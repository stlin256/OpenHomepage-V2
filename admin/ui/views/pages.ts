/**
 * 页面编辑视图：frontmatter 表单条 + Milkdown WYSIWYG + 工具栏
 * （插入指令 / 快照 / 重命名 / 删除 / 创建另一语言版）+ 1.5s 停顿自动保存。
 * 返回 cleanup（路由离开时销毁编辑器并 flush 未保存内容）。
 */
import type { Editor } from '@milkdown/core';
import { getMarkdown, insert } from '@milkdown/utils';
import { el, btn, textInput, numberInput, checkbox } from '../dom.ts';
import { api } from '../api.ts';
import { createAutosave } from '../../shared/autosave.ts';
import { buildEditor } from '../editor/create-editor.ts';
import { createDirectiveViews } from '../editor/directive-views.ts';
import { DIRECTIVE_DEFS, INSERT_SNIPPETS } from '../editor/directive-nodes.ts';
import type { AppState } from '../main.ts';

const AUTOSAVE_DELAY = 1500;

function fmtTs(ts: string): string {
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)} ${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}`;
}

export async function renderPageEditor(
  container: HTMLElement,
  state: AppState,
  lang: string,
  file: string
): Promise<() => void> {
  const t = state.t;
  const page = await api.page(lang, file);
  let editor: Editor | null = null;
  let saving = false;

  // ---- frontmatter 表单条 ----
  const fm = { nav: true, ...page.frontmatter } as Record<string, unknown>;
  const titleInput = textInput(String(fm.title ?? ''), (v) => {
    fm.title = v;
    autosave.touch();
  });
  const slugInput = textInput(String(fm.slug ?? ''), (v) => {
    fm.slug = v;
    autosave.touch();
  });
  const navInput = checkbox(Boolean(fm.nav), (v) => {
    fm.nav = v;
    autosave.touch();
  });
  const orderInput = numberInput(fm.order as number | undefined, (v) => {
    fm.order = v;
    autosave.touch();
  });
  const descInput = textInput(String(fm.description ?? ''), (v) => {
    fm.description = v;
    autosave.touch();
  });

  const formBar = el(
    'div',
    { class: 'fm-bar' },
    el('label', { class: 'fm-field fm-grow' }, el('span', {}, t('frontmatterTitle')), titleInput),
    el('label', { class: 'fm-field' }, el('span', {}, t('frontmatterSlug')), slugInput),
    el('label', { class: 'fm-field fm-check' }, el('span', {}, t('frontmatterNav')), navInput),
    el('label', { class: 'fm-field fm-num' }, el('span', {}, t('frontmatterOrder')), orderInput),
    el('label', { class: 'fm-field fm-grow' }, el('span', {}, t('frontmatterDescription')), descInput)
  );

  // ---- 保存 ----
  const save = async () => {
    if (!editor || saving) return;
    saving = true;
    state.setStatus(t('saving'));
    try {
      const body = editor.action(getMarkdown());
      await api.savePage(lang, file, fm, body);
      state.setStatus(t('saved'), 'ok');
    } catch (e) {
      state.setStatus(`${t('saveFailed')}: ${(e as Error).message}`, 'err');
    } finally {
      saving = false;
    }
  };
  const autosave = createAutosave(AUTOSAVE_DELAY, () => void save());

  // ---- 工具栏 ----
  const insertSel = el('select', { class: 'input' }) as HTMLSelectElement;
  insertSel.append(el('option', { value: '' }, t('insertDirective')));
  const dirLabels: Record<string, string> = {
    bilibili: t('dirBilibili'),
    youtube: t('dirYoutube'),
    video: t('dirVideo'),
    audio: t('dirAudio'),
    figure: t('dirFigure'),
    grid: t('dirGrid'),
    stream: t('dirStream'),
    ghcard: t('dirGhcard'),
  };
  for (const def of DIRECTIVE_DEFS) {
    insertSel.append(el('option', { value: def.id }, dirLabels[def.id] ?? def.name));
  }
  insertSel.append(el('option', { value: 'grid' }, dirLabels.grid));
  insertSel.addEventListener('change', () => {
    const id = insertSel.value;
    insertSel.value = '';
    if (!id || !editor) return;
    editor.action(insert(INSERT_SNIPPETS[id] ?? ''));
    autosave.touch();
  });

  const openSnapshots = async () => {
    const overlay = el('div', { class: 'modal-overlay' });
    const close = () => overlay.remove();
    const { snapshots } = await api.snapshots(`pages/${lang}/${file}`);
    const list = el('div', { class: 'snapshot-list' });
    if (snapshots.length === 0) list.append(el('p', { class: 'muted' }, t('snapshotEmpty')));
    for (const s of snapshots) {
      list.append(
        el(
          'div',
          { class: 'snapshot-row' },
          el('span', {}, fmtTs(s.ts)),
          btn(t('snapshotRestore'), () => {
            if (!confirm(t('snapshotRestoreConfirm'))) return;
            void api
              .restoreSnapshot(`pages/${lang}/${file}`, s.ts)
              .then(async () => {
                close();
                state.setStatus(t('restored'), 'ok');
                await state.refreshSidebar();
                // hash 未变化，手动触发 hashchange 重新加载当前页
                window.dispatchEvent(new HashChangeEvent('hashchange'));
              })
              .catch((e) => state.setStatus(String((e as Error).message), 'err'));
          })
        )
      );
    }
    overlay.append(
      el('div', { class: 'modal' }, el('h3', {}, t('snapshots')), list,
        el('div', { class: 'modal-ops' }, btn(t('close'), close)))
    );
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    document.body.append(overlay);
  };

  const doRename = () => {
    const name = prompt(t('renamePrompt'), file.replace(/\.md$/, ''));
    if (!name || name === file.replace(/\.md$/, '')) return;
    void api
      .renamePage(lang, file, `${name}.md`)
      .then(async () => {
        await state.refreshSidebar();
        state.navigate(`#/page/${lang}/${name}.md`);
      })
      .catch((e) => state.setStatus((e as Error).message, 'err'));
  };

  const doDelete = () => {
    if (!confirm(t('confirmDeletePage'))) return;
    void api
      .deletePage(lang, file)
      .then(async () => {
        await state.refreshSidebar();
        const list = await api.pages();
        const first = list.pages[0];
        state.navigate(first ? `#/page/${first.lang}/${first.file}` : '#/assets');
      })
      .catch((e) => state.setStatus((e as Error).message, 'err'));
  };

  const doTranslate = () => {
    void (async () => {
      try {
        const { pages } = await api.pages();
        const langs = [...new Set(pages.map((p) => p.lang))];
        const other = langs.find((l) => l !== lang) ?? (lang === 'zh' ? 'en' : 'zh');
        const slug = String(fm.slug ?? file.replace(/\.md$/, ''));
        const body = editor ? editor.action(getMarkdown()) : page.body;
        const r = await api.createPage(other, String(fm.title ?? file), slug, body);
        state.setStatus(t('otherLangCreated'), 'ok');
        await state.refreshSidebar();
        state.navigate(`#/page/${other}/${r.file}`);
      } catch (e) {
        const msg = (e as Error).message;
        state.setStatus(/已存在/.test(msg) ? t('otherLangExists') : msg, 'err');
      }
    })();
  };

  const toolbar = el(
    'div',
    { class: 'editor-toolbar' },
    insertSel,
    btn(t('snapshots'), () => void openSnapshots()),
    btn(t('renamePage'), doRename),
    btn(t('createOtherLang'), doTranslate),
    btn(t('deletePage'), doDelete, 'btn-danger'),
    el('span', { class: 'muted toolbar-hint' }, t('pasteImageHint'))
  );

  // ---- 编辑器 ----
  const editorHost = el('div', { class: 'editor-host' });
  container.replaceChildren(formBar, toolbar, editorHost);

  editor = await buildEditor(
    editorHost,
    page.body,
    {
      onDocChanged: () => autosave.touch(),
      onPasteImage: async (img) => {
        const ext = (img.name.split('.').pop() || 'png').toLowerCase();
        const stamp = new Date()
          .toISOString()
          .replace(/[-:T]/g, '')
          .slice(0, 14);
        try {
          const r = await api.uploadAsset(`pasted-${stamp}.${ext}`, await img.arrayBuffer());
          return `assets/${r.name}`;
        } catch (e) {
          state.setStatus((e as Error).message, 'err');
          return null;
        }
      },
    },
    createDirectiveViews(t)
  );

  return () => {
    autosave.flush();
    void editor?.destroy();
  };
}
