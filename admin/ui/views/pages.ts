/**
 * 页面编辑视图：frontmatter 表单条 + 三种编辑模式（所见即所得 / 源码 / 双栏预览）
 * + 工具栏（插入指令 / 快照 / 重命名 / 删除 / 创建另一语言版）+ 1.5s 停顿自动保存。
 * 源码模式为等宽 textarea，与 WYSIWYG 互切时经 Milkdown 序列化/解析保持同步；
 * 双栏模式一侧编辑一侧 iframe 预览 dev server 页面，自动保存成功后刷新预览。
 * 返回 cleanup（路由离开时销毁编辑器并 flush 未保存内容）。
 */
import type { Editor } from '@milkdown/core';
import { getMarkdown, insert, replaceAll } from '@milkdown/utils';
import { el, btn, textInput, numberInput, checkbox } from '../dom.ts';
import { api } from '../api.ts';
import { createAutosave } from '../../shared/autosave.ts';
import { buildEditor } from '../editor/create-editor.ts';
import { createDirectiveViews } from '../editor/directive-views.ts';
import { DIRECTIVE_DEFS, INSERT_SNIPPETS } from '../editor/directive-nodes.ts';
import type { AppState } from '../main.ts';

const AUTOSAVE_DELAY = 1500;
const DEV_DEFAULT_ORIGIN = 'http://127.0.0.1:4321';

type EditMode = 'wysiwyg' | 'source';

function fmtTs(ts: string): string {
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)} ${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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
  let editMode: EditMode = 'wysiwyg';
  let splitOn = false;

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

  // ---- 保存（正文取当前编辑面的内容）----
  const currentMarkdown = (): string => {
    if (editMode === 'source') return sourceEl.value;
    return editor ? editor.action(getMarkdown()) : page.body;
  };
  const save = async () => {
    if (saving) return;
    saving = true;
    state.setStatus(t('saving'));
    try {
      await api.savePage(lang, file, fm, currentMarkdown());
      state.setStatus(t('saved'), 'ok');
      refreshPreview();
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
    if (!id) return;
    if (editMode === 'source') {
      // 源码模式：插入到光标处
      const { selectionStart, selectionEnd } = sourceEl;
      sourceEl.setRangeText(INSERT_SNIPPETS[id] ?? '', selectionStart, selectionEnd, 'end');
      autosave.touch();
      return;
    }
    editor?.action(insert(INSERT_SNIPPETS[id] ?? ''));
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
        const r = await api.createPage(other, String(fm.title ?? file), slug, currentMarkdown());
        state.setStatus(t('otherLangCreated'), 'ok');
        await state.refreshSidebar();
        state.navigate(`#/page/${other}/${r.file}`);
      } catch (e) {
        const msg = (e as Error).message;
        state.setStatus(/已存在/.test(msg) ? t('otherLangExists') : msg, 'err');
      }
    })();
  };

  // ---- 编辑模式分段控件（所见即所得 / 源码 / 双栏预览）----
  const segBtns = {} as Record<'wysiwyg' | 'source' | 'split', HTMLButtonElement>;
  const subSegBtns = {} as Record<EditMode, HTMLButtonElement>;

  const updateSeg = () => {
    segBtns.wysiwyg.classList.toggle('active', !splitOn && editMode === 'wysiwyg');
    segBtns.source.classList.toggle('active', !splitOn && editMode === 'source');
    segBtns.split.classList.toggle('active', splitOn);
    subSegBtns.wysiwyg.classList.toggle('active', editMode === 'wysiwyg');
    subSegBtns.source.classList.toggle('active', editMode === 'source');
  };

  const setEditMode = (mode: EditMode) => {
    if (mode === editMode) return;
    if (mode === 'source') {
      // WYSIWYG → 源码：序列化当前文档
      sourceEl.value = editor ? editor.action(getMarkdown()) : page.body;
      editorHost.style.display = 'none';
      sourceEl.style.display = '';
    } else {
      // 源码 → WYSIWYG：解析源码重建文档
      editor?.action(replaceAll(sourceEl.value));
      sourceEl.style.display = 'none';
      editorHost.style.display = '';
    }
    editMode = mode;
    updateSeg();
  };

  const setSplit = (on: boolean) => {
    if (splitOn === on) return;
    splitOn = on;
    editorWrap.classList.toggle('split', on);
    previewPane.style.display = on ? '' : 'none';
    subSeg.style.display = on ? '' : 'none';
    updateSeg();
    if (on) void refreshPreviewStatus();
  };

  const seg = el('div', { class: 'seg' });
  for (const [id, labelKey] of [
    ['wysiwyg', 'modeWysiwyg'],
    ['source', 'modeSource'],
    ['split', 'modeSplit'],
  ] as const) {
    segBtns[id] = btn(t(labelKey), () => {
      if (id === 'split') setSplit(true);
      else {
        setSplit(false);
        setEditMode(id);
      }
    }, 'seg-item');
    seg.append(segBtns[id]);
  }

  const modeGroup = el('div', { class: 'toolbar-group toolbar-mode' }, seg);
  const insertGroup = el('div', { class: 'toolbar-group toolbar-insert' }, insertSel);
  const pageOps = el(
    'div',
    { class: 'toolbar-group toolbar-page-ops' },
    btn(t('snapshots'), () => void openSnapshots()),
    btn(t('renamePage'), doRename),
    btn(t('createOtherLang'), doTranslate),
    btn(t('deletePage'), doDelete, 'btn-danger')
  );

  const toolbar = el(
    'div',
    { class: 'editor-toolbar' },
    modeGroup,
    insertGroup,
    pageOps,
    el('span', { class: 'muted toolbar-hint' }, t('pasteImageHint'))
  );

  // ---- 编辑面：Milkdown（默认）+ 源码 textarea（初始隐藏）----
  const editorHost = el('div', { class: 'editor-host' });
  const sourceEl = el('textarea', {
    class: 'source-editor',
    'aria-label': t('modeSource'),
    spellcheck: 'false',
    style: 'display:none',
  }) as HTMLTextAreaElement;
  sourceEl.addEventListener('input', () => autosave.touch());

  // 双栏模式下编辑面顶部的小切换（所见即所得 / 源码）
  const subSeg = el('div', { class: 'seg seg-mini', style: 'display:none' });
  for (const [id, labelKey] of [
    ['wysiwyg', 'modeWysiwyg'],
    ['source', 'modeSource'],
  ] as const) {
    subSegBtns[id] = btn(t(labelKey), () => setEditMode(id), 'seg-item');
    subSeg.append(subSegBtns[id]);
  }
  const editPane = el('div', { class: 'edit-pane' }, subSeg, editorHost, sourceEl);

  // ---- 预览面：iframe 指向 dev server 页面；未运行时可一键启动 ----
  let previewOrigin = DEV_DEFAULT_ORIGIN;
  let iframeEl: HTMLIFrameElement | null = null;
  const previewUrl = () => `${previewOrigin.replace(/\/+$/, '')}${page.previewPath ?? '/'}`;

  const previewBody = el('div', { class: 'preview-body' });
  const stopBtn = btn(t('previewStop'), () => {
    void api.devStop().then(() => refreshPreviewStatus());
  });
  stopBtn.style.display = 'none';
  const previewBar = el(
    'div',
    { class: 'preview-bar' },
    el('span', { class: 'muted preview-url' }, previewUrl()),
    btn(t('previewRefresh'), () => refreshPreview()),
    btn(t('previewOpenTab'), () => window.open(previewUrl(), '_blank')),
    stopBtn
  );

  const showIframe = (status: { url: string | null; managed: boolean }) => {
    previewOrigin = status.url ?? DEV_DEFAULT_ORIGIN;
    iframeEl = el('iframe', { class: 'preview-frame', src: previewUrl() }) as HTMLIFrameElement;
    previewBody.replaceChildren(iframeEl);
    previewBar.querySelector('.preview-url')!.textContent = previewUrl();
    stopBtn.style.display = status.managed ? '' : 'none';
  };

  const showGuide = (error?: string | null, logTail?: string[]) => {
    iframeEl = null;
    stopBtn.style.display = 'none';
    const guide = el(
      'div',
      { class: 'preview-guide' },
      el('p', { class: 'muted' }, error ? `${t('previewStartFailed')}: ${error}` : t('previewDownGuide')),
      btn(t('previewStart'), () => void startPreview(), 'btn-primary')
    );
    if (logTail && logTail.length > 0) {
      guide.append(
        el('details', { class: 'preview-log' },
          el('summary', {}, t('previewLog')),
          el('pre', {}, logTail.join('\n')))
      );
    }
    previewBody.replaceChildren(guide);
  };

  /** 一键启动预览服务：POST start 后轮询直到端口就绪（超时 ~45s） */
  const startPreview = async () => {
    previewBody.replaceChildren(el('p', { class: 'muted' }, t('previewStarting')));
    try {
      await api.devStart();
      for (let i = 0; i < 45; i++) {
        const s = await api.devStatus();
        if (s.up) {
          showIframe(s);
          return;
        }
        if (s.error) break;
        await sleep(1000);
      }
      const s = await api.devStatus();
      showGuide(s.error ?? t('previewTimeout'), s.logTail);
    } catch (e) {
      showGuide((e as Error).message);
    }
  };

  const refreshPreviewStatus = async () => {
    try {
      const s = await api.devStatus();
      if (s.up) showIframe(s);
      else showGuide(s.error, s.logTail);
    } catch {
      showGuide();
    }
  };

  /** 自动保存成功后刷新 iframe（Astro dev 按请求重新渲染） */
  function refreshPreview(): void {
    if (!splitOn || !iframeEl) return;
    iframeEl.src = previewUrl();
  }

  const previewPane = el('div', { class: 'preview-pane', style: 'display:none' }, previewBar, previewBody);
  const editorWrap = el('div', { class: 'editor-wrap' }, editPane, previewPane);
  container.replaceChildren(formBar, toolbar, editorWrap);
  updateSeg();

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
    createDirectiveViews(t, undefined, state.lang)
  );

  return () => {
    autosave.flush();
    void editor?.destroy();
  };
}
