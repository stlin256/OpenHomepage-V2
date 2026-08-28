/**
 * 页面视图（M12e 重写，docs/specs/12 §4）：
 * frontmatter 纵向表单（标题/slug/nav/order/描述/notice）+ 整页源码 textarea（等宽，
 * 1.5s 停顿自动保存，兜底编辑面）+「可视化编辑」主按钮（确保 dev server 运行后打开
 * 对应页面 ?edit=1）+ 页面操作（快照/重命名/删除/创建另一语言版）。
 * 返回 cleanup（路由离开时 flush 未保存内容）。
 */
import { el, btn, textInput, numberInput, checkbox, select, field } from '../dom.ts';
import { api } from '../api.ts';
import { createAutosave } from '../../shared/autosave.ts';
import { languageOptions, type LanguageOption } from '../../shared/languages.ts';
import type { AppState } from '../main.ts';

const AUTOSAVE_DELAY = 1500;

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
  let saving = false;

  // ---- frontmatter 纵向表单 ----
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
  let initialNoticeText = '';
  let initialNoticeColor = 'accent';
  if (typeof fm.notice === 'string') {
    initialNoticeText = fm.notice;
  } else if (typeof fm.notice === 'object' && fm.notice !== null) {
    const no = fm.notice as Record<string, unknown>;
    initialNoticeText = String(no.text ?? no.content ?? '');
    initialNoticeColor = String(no.color ?? 'accent');
  }

  let noticeTextInput: HTMLInputElement;
  let noticeColorSelect: HTMLSelectElement;

  const syncNotice = () => {
    const text = noticeTextInput.value.trim();
    const color = noticeColorSelect.value;
    if (!text) {
      delete fm.notice;
    } else if (color === 'accent' || !color) {
      fm.notice = text;
    } else {
      fm.notice = { text, color };
    }
    autosave.touch();
  };

  noticeTextInput = textInput(initialNoticeText, () => syncNotice());
  noticeColorSelect = select(
    [
      { value: 'accent', label: t('noticeColorAccent') },
      { value: 'yellow', label: t('noticeColorYellow') },
      { value: 'red', label: t('noticeColorRed') },
      { value: 'custom', label: t('noticeColorCustom') },
    ],
    initialNoticeColor,
    () => syncNotice()
  );

  const form = el(
    'div',
    { class: 'form-grid' },
    field(t('frontmatterTitle'), titleInput),
    field(t('frontmatterSlug'), slugInput),
    field(t('frontmatterNav'), navInput),
    field(t('frontmatterOrder'), orderInput),
    field(t('frontmatterDescription'), descInput),
    field(t('frontmatterNotice'), noticeTextInput),
    field(t('frontmatterNoticeColor'), noticeColorSelect)
  );

  // ---- 保存（正文取源码 textarea；frontmatter 与正文一起 PUT）----
  const save = async () => {
    if (saving) return;
    saving = true;
    state.setStatus(t('saving'));
    try {
      await api.savePage(lang, file, fm, sourceEl.value);
      state.setStatus(t('saved'), 'ok');
    } catch (e) {
      state.setStatus(`${t('saveFailed')}: ${(e as Error).message}`, 'err');
    } finally {
      saving = false;
    }
  };
  const autosaveImpl = createAutosave(AUTOSAVE_DELAY, () => void save());
  const autosave = {
    touch() {
      state.setStatus(t('unsavedChanges'));
      autosaveImpl.touch();
    },
    flush: () => autosaveImpl.flush(),
    cancel: () => autosaveImpl.cancel(),
    get pending() {
      return autosaveImpl.pending;
    },
  };

  // ---- 整页源码（兜底编辑面，等宽 textarea）----
  const sourceEl = el('textarea', {
    class: 'source-editor',
    'aria-label': t('pageSourceLabel'),
    spellcheck: 'false',
  }) as HTMLTextAreaElement;
  sourceEl.value = page.body;
  sourceEl.addEventListener('input', () => autosave.touch());

  // ---- 页面操作（快照 / 重命名 / 删除 / 创建另一语言版）----
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
      let options: LanguageOption[];
      let slug: string;
      try {
        const { pages } = await api.pages();
        slug = String(fm.slug ?? file.replace(/\.md$/, ''));
        const existingLangs = [...new Set(pages.map((p) => p.lang))];
        // 已拥有该页面的语言不再列出（避免冲突）；项目未预制的常用语言列在后面，选中即新建语言目录
        const takenLangs = [...new Set(pages.filter((p) => p.slug === slug).map((p) => p.lang))];
        options = languageOptions(existingLangs, takenLangs);
      } catch (e) {
        state.setStatus((e as Error).message, 'err');
        return;
      }
      if (options.length === 0) {
        state.setStatus(t('otherLangExists'), 'err');
        return;
      }

      const overlay = el('div', { class: 'modal-overlay' });
      const close = () => overlay.remove();
      const langSel = el('select', { class: 'input' }) as HTMLSelectElement;
      const existingGroup = el('optgroup', { label: t('wizardLangExisting') });
      const commonGroup = el('optgroup', { label: t('wizardLangCommon') });
      for (const o of options) {
        (o.existing ? existingGroup : commonGroup).append(el('option', { value: o.code }, o.label));
      }
      if (existingGroup.childElementCount) langSel.append(existingGroup);
      if (commonGroup.childElementCount) langSel.append(commonGroup);

      const submit = async () => {
        try {
          const r = await api.createPage(langSel.value, String(fm.title ?? file), slug, sourceEl.value);
          close();
          state.setStatus(t('otherLangCreated'), 'ok');
          await state.refreshSidebar();
          state.navigate(`#/page/${langSel.value}/${r.file}`);
        } catch (e) {
          const msg = (e as Error).message;
          state.setStatus(/已存在/.test(msg) ? t('otherLangExists') : msg, 'err');
        }
      };

      overlay.append(
        el(
          'div',
          { class: 'modal' },
          el('h3', {}, t('translateTitle')),
          field(t('translateLang'), langSel),
          el(
            'div',
            { class: 'modal-ops' },
            btn(t('wizardCreate'), () => void submit(), 'btn-primary'),
            btn(t('cancel'), close)
          )
        )
      );
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });
      document.body.append(overlay);
    })();
  };

  // ---- 「可视化编辑」主按钮：确保托管 dev server 运行后新标签打开 ?edit=1 ----
  // up 且 managed → 直接打开；down → devStart 后轮询至就绪（~45s）再打开；
  // up 但非 managed（外部手动启动，无 OH_EDIT 注入）→ 提示用户手动停掉外部进程后改为托管启动。
  const DEV_FALLBACK_ORIGIN = 'http://127.0.0.1:4321';
  const editUrl = (origin: string) =>
    `${origin.replace(/\/+$/, '')}${page.previewPath ?? '/'}?edit=1`;
  const openVisualEdit = (origin: string) => window.open(editUrl(origin), '_blank');

  const externalHint = el('p', { class: 'muted page-edit-hint', style: 'display:none' });
  const externalRestartBtn = btn(t('devRestartManaged'), () => void restartManaged());
  externalRestartBtn.style.display = 'none';
  const showExternalHint = (on: boolean) => {
    externalHint.style.display = on ? '' : 'none';
    externalRestartBtn.style.display = on ? '' : 'none';
    if (on) externalHint.textContent = t('visualEditExternalHint');
  };

  /** 托管启动并轮询至端口就绪（~45s），成功后打开编辑页；失败在状态栏报错 */
  const startManagedAndOpen = async () => {
    visualEditBtn.disabled = true;
    state.setStatus(t('previewStarting'));
    try {
      await api.devStart();
      for (let i = 0; i < 45; i++) {
        const s = await api.devStatus();
        if (s.up && s.managed) {
          showExternalHint(false);
          openVisualEdit(s.url ?? DEV_FALLBACK_ORIGIN);
          return;
        }
        if (s.up && !s.managed) {
          // 端口被外部 dev server 占用：提示用户手动停止后重试（不强杀外部进程）
          showExternalHint(true);
          return;
        }
        if (s.error) break;
        await sleep(1000);
      }
      const s = await api.devStatus();
      state.setStatus(`${t('previewStartFailed')}: ${s.error ?? t('previewTimeout')}`, 'err');
    } catch (e) {
      state.setStatus(`${t('previewStartFailed')}: ${(e as Error).message}`, 'err');
    } finally {
      visualEditBtn.disabled = false;
    }
  };

  /** 「重启为托管预览」：devStop 不动外部进程，实际生效前提是用户已手动停掉外部 dev server */
  const restartManaged = async () => {
    await api.devStop().catch(() => undefined);
    await startManagedAndOpen();
  };

  const visualEditBtn = btn(
    t('openVisualEdit'),
    () => {
      void (async () => {
        try {
          const s = await api.devStatus();
          if (s.up && s.managed) {
            showExternalHint(false);
            openVisualEdit(s.url ?? DEV_FALLBACK_ORIGIN);
          } else if (s.up && !s.managed) {
            showExternalHint(true);
          } else {
            await startManagedAndOpen();
          }
        } catch (e) {
          state.setStatus(`${t('previewStartFailed')}: ${(e as Error).message}`, 'err');
        }
      })();
    },
    'btn-primary'
  );

  const opsBar = el(
    'div',
    { class: 'page-ops-bar' },
    visualEditBtn,
    externalRestartBtn,
    el(
      'span',
      { class: 'page-ops-group' },
      btn(t('snapshots'), () => void openSnapshots()),
      btn(t('renamePage'), doRename),
      btn(t('createOtherLang'), doTranslate),
      btn(t('deletePage'), doDelete, 'btn-danger')
    )
  );

  container.replaceChildren(
    el('div', { class: 'page-editor' }, opsBar, externalHint, form, sourceEl)
  );

  return () => {
    autosave.flush();
  };
}
