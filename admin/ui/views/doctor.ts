/**
 * 健康检查视图（spec 20）：在后台内运行 doctor 自检（scripts/doctor-lib.ts 的同一套检查）。
 * 默认离线；勾选「含在线检查」追加 GitHub API / RSS 源探测。
 * 报告按级别分色（ok/warn/error/skip），修复建议以 <details> 折叠展开。
 */
import { el, btn } from '../dom.ts';
import { api, type DoctorItemView } from '../api.ts';
import type { AppState } from '../main.ts';

const SEV_LABEL_KEY = {
  ok: 'doctorSevOk',
  warn: 'doctorSevWarn',
  error: 'doctorSevError',
  skip: 'doctorSevSkip',
} as const;

export async function renderDoctor(
  container: HTMLElement,
  state: AppState,
  online = false
): Promise<void> {
  const t = state.t;

  const loading = el('p', { class: 'muted' }, t('doctorRunning'));
  container.replaceChildren(
    el('h2', { class: 'section-title' }, t('navDoctor')),
    el('p', { class: 'muted' }, t('doctorHint')),
    loading
  );

  const { report, summary } = await api.doctor(online);
  loading.remove();

  const onlineBox = el('input', { type: 'checkbox' }) as HTMLInputElement;
  onlineBox.checked = online;
  onlineBox.addEventListener('change', () => {
    void renderDoctor(container, state, onlineBox.checked);
  });

  const renderItem = (item: DoctorItemView): HTMLElement =>
    el(
      'div',
      { class: 'doctor-item' },
      el('span', { class: `doctor-badge ${item.severity}` }, t(SEV_LABEL_KEY[item.severity])),
      item.suggestion
        ? el(
            'details',
            { class: 'doctor-detail' },
            el('summary', { class: 'doctor-msg' }, item.message),
            el('p', { class: 'doctor-suggestion' }, item.suggestion)
          )
        : el('span', { class: 'doctor-msg' }, item.message)
    );

  container.append(
    el(
      'div',
      { class: 'doctor-controls' },
      el('label', { class: 'doctor-online' }, onlineBox, t('doctorOnline')),
      btn(t('doctorRun'), () => void renderDoctor(container, state, onlineBox.checked), 'btn-sm')
    ),
    el(
      'p',
      { class: `doctor-summary${summary.error > 0 ? ' has-error' : summary.warn > 0 ? ' has-warn' : ''}` },
      t('doctorSummary')
        .replace('{0}', String(summary.ok))
        .replace('{1}', String(summary.warn))
        .replace('{2}', String(summary.error))
        .replace('{3}', String(summary.skip))
    ),
    ...report.sections.map((section) =>
      el(
        'section',
        { class: 'doctor-section' },
        el('h3', { class: 'section-title' }, section.title),
        el('div', { class: 'doctor-list' }, ...section.items.map(renderItem))
      )
    )
  );
}
