/**
 * 「部署到线上」引导卡片（spec 22）：顶栏「🚀 部署到线上」打开。
 * 四步检查清单：①导出 data.zip（内嵌现有导出）→ ②托管 zip 拿直链（私有 release /
 * secret gist / 对象存储，强调隐私）→ ③配置仓库 Secrets（DATA_SOURCE_URL / GH_PAT /
 * ENABLE_EXAMPLE，附 deep link）→ ④触发并观察 Actions 部署。
 * 仓库地址优先用 GET /api/deploy-info（服务端读 git remote origin）；读不到则用户手填，
 * 链接拼接纯前端完成（shared/deploy.ts，与服务端同一套解析逻辑）。
 */
import { el, btn, textInput } from '../dom.ts';
import { api } from '../api.ts';
import { githubWebUrl, deployLinks, type DeployLinks } from '../../shared/deploy.ts';
import type { AppState } from '../main.ts';

export function openDeployGuide(state: AppState): void {
  const t = state.t;
  // 同时只允许一个实例（同 onboarding）
  if (document.querySelector('.modal-overlay[data-deploy]')) return;

  const overlay = el('div', { class: 'modal-overlay onboarding-overlay' });
  overlay.dataset.deploy = '1';
  const body = el('div', { class: 'onboarding-body' });

  const close = (): void => {
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
  };
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKeydown);

  const externalLink = (href: string, label: string): HTMLElement =>
    el('a', { class: 'btn', href, target: '_blank', rel: ['noopener', 'noreferrer'].join(' ') }, label);

  const stepSection = (title: string, ...children: (Node | string)[]): HTMLElement =>
    el(
      'div',
      { class: 'deploy-step' },
      el('div', { class: 'side-title deploy-step-title' }, title),
      ...children
    );

  // ---- 第 ③ 步：Secrets deep link 区（deploy-info 命中 → 直接给链接；否则手填仓库地址）----
  const repoNote = el('p', { class: 'muted' });
  const linkRow = el('div', { class: 'deploy-links' });
  const repoField = el('div', { class: 'deploy-repo-field' });

  const renderLinks = (links: DeployLinks | null): void => {
    linkRow.replaceChildren(
      ...(links
        ? [
            externalLink(links.secretsUrl, t('deployOpenSecrets')),
            externalLink(links.newTokenUrl, t('deployOpenToken')),
            externalLink(links.actionsUrl, t('deployOpenActions')),
          ]
        : [])
    );
  };

  // 手填输入（未检测到仓库时展示）：输入即解析，解析成功立即刷新 deep link
  let detectedRepo: string | null = null;
  const repoInput = textInput('', (v) => {
    const web = githubWebUrl(v);
    renderLinks(web ? deployLinks(web) : null);
  }, t('deployRepoInputPlaceholder'));

  const renderRepoArea = (): void => {
    repoNote.textContent = detectedRepo
      ? t('deployRepoDetected').replace('{0}', detectedRepo)
      : t('deployRepoUndetected');
    repoField.replaceChildren(
      ...(detectedRepo ? [] : [el('label', { class: 'field' }, el('span', { class: 'field-label' }, t('deployRepoInputLabel')), repoInput)])
    );
  };

  body.replaceChildren(
    el('p', { class: 'muted onboarding-intro' }, t('deployIntro')),
    stepSection(
      t('deployStep1Title'),
      el('p', { class: 'muted' }, t('deployStep1Hint')),
      // 内嵌既有导出（GET /api/export-data，浏览器直接下载 zip）
      el('a', { class: 'btn', href: '/api/export-data' }, t('exportData'))
    ),
    stepSection(
      t('deployStep2Title'),
      el('p', { class: 'muted' }, t('deployStep2Hint')),
      el(
        'ul',
        { class: 'deploy-hosting-list' },
        el('li', {}, t('deployHostRelease')),
        el('li', {}, t('deployHostGist')),
        el('li', {}, t('deployHostStorage'))
      ),
      el('p', { class: 'deploy-privacy' }, t('deployPrivacyWarn'))
    ),
    stepSection(
      t('deployStep3Title'),
      el('p', { class: 'muted' }, t('deployStep3Hint')),
      el(
        'ul',
        { class: 'deploy-hosting-list' },
        el('li', {}, t('deploySecretDataSource')),
        el('li', {}, t('deploySecretGhPat')),
        el('li', {}, t('deploySecretEnableExample'))
      ),
      repoNote,
      repoField,
      linkRow
    ),
    stepSection(t('deployStep4Title'), el('p', { class: 'muted' }, t('deployStep4Hint')))
  );

  const modal = el(
    'div',
    { class: 'modal onboarding-modal deploy-modal', role: 'dialog', 'aria-modal': 'true' },
    el('h3', {}, t('deployTitle')),
    body,
    el('div', { class: 'modal-ops onboarding-ops' }, el('span', { class: 'topbar-spacer' }), btn(t('close'), close))
  );
  overlay.append(modal);
  document.body.append(overlay);

  // 初始：未检测到仓库时的降级形态；随后 deploy-info 返回命中再切换
  renderRepoArea();
  void api
    .deployInfo()
    .then((info) => {
      if (info.repoUrl) {
        detectedRepo = info.repoUrl;
        renderLinks(deployLinks(info.repoUrl));
        renderRepoArea();
      }
    })
    .catch(() => {
      /* 探测失败保持手填降级形态 */
    });
}
