/**
 * 语言管理视图（spec 19 §4）：勾选启停语言。
 * 「停用」= 服务端把 data/pages/<lang>/ 与 data/streaming/<lang>/（若存在）归档到
 * data/.archived_langs/（归档前自动快照；配置里的多语言文本键保留不删，恢复无损）；
 * 「恢复」反向移回。默认语言锁定不可停用；停用 en 或停用后剩余 <2 语言时，
 * 确认对话框展示 spec 风险文案（回退链断裂 / 整站 i18n 关闭）。
 */
import { el, btn } from '../dom.ts';
import { api, type LanguageState, type LangDirInfo } from '../api.ts';
import type { AppState } from '../main.ts';

export async function renderLanguages(container: HTMLElement, state: AppState): Promise<void> {
  const t = state.t;
  const info: LanguageState = await api.languages();

  const reload = async () => {
    await state.refreshSidebar();
    await renderLanguages(container, state);
  };

  // 确认对话框（复用 .modal-overlay/.modal）；warns 为逐条风险说明
  const confirmDialog = (title: string, warns: string[], onConfirm: () => Promise<void>) => {
    const overlay = el('div', { class: 'modal-overlay' });
    const error = el('div', { class: 'form-error' });
    const close = () => overlay.remove();
    const okBtn = btn(t('confirm'), () => {
      okBtn.disabled = true;
      onConfirm()
        .then(() => {
          close();
          void reload();
        })
        .catch((e: unknown) => {
          error.textContent = (e as Error).message;
          okBtn.disabled = false;
        });
    }, 'btn-primary');
    overlay.append(
      el(
        'div',
        { class: 'modal' },
        el('h3', {}, title),
        ...warns.map((w) => el('p', { class: 'lang-warn' }, w)),
        error,
        el('div', { class: 'modal-ops' }, okBtn, btn(t('cancel'), close))
      )
    );
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    document.body.append(overlay);
  };

  const doArchive = (lang: string) => {
    const warns = [t('langDisableBase')];
    // 风险②：en 是回退链固定一环，停用改变其他语言的缺译回退行为
    if (lang === 'en') warns.push(t('langWarnEn'));
    // 风险③：停用后剩余 <2 语言时整站 i18n 关闭（带前缀路由消失、外链 404）
    if (info.total - 1 < 2) {
      warns.push(t('langWarnLast').replace('{0}', String(info.total - 1)));
    }
    confirmDialog(t('langDisableTitle').replace('{0}', lang), warns, async () => {
      await api.archiveLanguage(lang, true);
      state.setStatus(t('langDoneDisable').replace('{0}', lang), 'ok');
    });
  };

  const doRestore = (lang: string) => {
    confirmDialog(t('langRestoreTitle').replace('{0}', lang), [t('langRestoreBase')], async () => {
      await api.restoreLanguage(lang);
      state.setStatus(t('langDoneRestore').replace('{0}', lang), 'ok');
    });
  };

  const langRow = (l: LangDirInfo, archivedRow: boolean): HTMLElement => {
    const isDefault = !archivedRow && l.lang === info.defaultLang;
    const children: (Node | string)[] = [
      el('span', { class: 'lang-name' }, l.lang),
      el('span', { class: 'muted' }, t('langPageCount').replace('{0}', String(l.pages))),
    ];
    if (isDefault) {
      children.push(el('span', { class: 'i18n-badge ready' }, t('langDefaultBadge')));
    }
    const opBtn = archivedRow
      ? btn(t('langRestore'), () => doRestore(l.lang), 'btn-sm')
      : btn(t('langDisable'), () => doArchive(l.lang), 'btn-sm btn-danger');
    // 风险①：默认语言停用会导致 URL 前缀规则整体漂移——锁定并标注
    if (isDefault) opBtn.disabled = true;
    children.push(opBtn);
    return el('div', { class: 'lang-row' }, ...children);
  };

  container.replaceChildren(
    el('h2', { class: 'section-title' }, t('langManageTitle')),
    el('p', { class: 'muted' }, t('langManageHint')),
    el('h3', { class: 'section-title' }, t('langActiveGroup')),
    el('div', { class: 'lang-list' }, ...info.languages.map((l) => langRow(l, false))),
    el('h3', { class: 'section-title' }, t('langArchivedGroup')),
    info.archived.length
      ? el('div', { class: 'lang-list' }, ...info.archived.map((l) => langRow(l, true)))
      : el('p', { class: 'muted' }, t('langArchivedEmpty'))
  );
}
