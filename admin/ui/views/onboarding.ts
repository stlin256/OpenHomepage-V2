/**
 * 新手欢迎向导（spec 19）：三步卡片弹窗（个人名片 → 模块编排 → 主题色盘）。
 * 首次初始化 data/ 时自动弹出，也可由顶栏「🚀 新手向导」随时重开；
 * 完成或任何跳过/关闭路径都会写 data/.onboarding-done 标记（POST /api/onboarding/done），不再自动弹出。
 * 所有保存走既有 PUT /api/config/site（schema 校验 + 快照），配置改写逻辑在 shared/onboarding.ts。
 */
import { el, btn, textInput, checkbox, field } from '../dom.ts';
import { api } from '../api.ts';
import {
  listModuleCandidates,
  enabledModuleKeys,
  applyModuleSelection,
  applyFeatureToggles,
  applyOnboardingProfile,
  applyAccent,
  ACCENT_PRESETS,
  type Obj,
} from '../../shared/onboarding.ts';
import type { AppState } from '../main.ts';

/** LocalizedText（string | {zh,en,...}）→ 双语输入初值 */
function locParts(v: unknown): { zh: string; en: string } {
  if (typeof v === 'string') return { zh: v, en: '' };
  const o = (v ?? {}) as Obj;
  return { zh: String(o.zh ?? ''), en: String(o.en ?? '') };
}

const BLOCK_LABEL_KEYS: Record<string, string> = {
  profile: 'modProfile',
  streaming: 'modStreaming',
  editorial: 'modEditorial',
  markdown: 'modMarkdown',
  github: 'modGithub',
  rss: 'modRss',
};

export function openOnboardingWizard(state: AppState): void {
  const t = state.t;
  // 同时只允许一个向导实例
  if (document.querySelector('.onboarding-overlay')) return;

  let cfg: Obj | null = null;
  let step = 0;
  let dirty = false; // 当前步是否有改动（有改动离开时才保存）
  // 点选色板的实时预览；未保存关闭时还原，避免编辑器残留未落盘的 accent
  const originalAccent = document.documentElement.style.getPropertyValue('--accent');

  const overlay = el('div', { class: 'modal-overlay onboarding-overlay' });
  const progress = el('div', { class: 'onboarding-progress muted' });
  const body = el('div', { class: 'onboarding-body' });
  const error = el('div', { class: 'form-error' });
  const ops = el('div', { class: 'modal-ops onboarding-ops' });

  /** 关闭：完成与跳过一样写完成标记（spec 19：完成或跳过即不再自动弹出） */
  const close = (msg?: string) => {
    document.removeEventListener('keydown', onKeydown);
    if (document.documentElement.style.getPropertyValue('--accent') !== originalAccent) {
      // 已保存的 accent 以 cfg 为准：完成路径保留预览色，其余还原
      document.documentElement.style.setProperty('--accent', originalAccent);
    }
    overlay.remove();
    void api.onboardingDone().catch((e: Error) => state.setStatus((e as Error).message, 'err'));
    if (msg) state.setStatus(msg, 'ok');
  };
  /** 完成路径：保留实时预览的 accent */
  const finish = (msg: string) => {
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
    void api.onboardingDone().catch((e: Error) => state.setStatus((e as Error).message, 'err'));
    state.setStatus(msg, 'ok');
  };
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close(t('onboardingSkipped'));
  };

  const saveCfg = async (): Promise<boolean> => {
    try {
      state.setStatus(t('saving'));
      await api.saveSite(cfg);
      state.setStatus(t('saved'), 'ok');
      dirty = false;
      return true;
    } catch (e) {
      error.textContent = `${t('saveFailed')}: ${(e as Error).message}`;
      state.setStatus(t('saveFailed'), 'err');
      return false;
    }
  };

  const stepTitles = [t('onboardingStep1Title'), t('onboardingStep2Title'), t('onboardingStep3Title')];

  // ---- 第 1 步：个人名片 ----
  const renderStep1 = (): void => {
    const profile = (cfg!.profile ?? {}) as Obj;
    const github = (cfg!.github ?? {}) as Obj;
    const name = locParts(profile.name);
    const tagline = locParts(profile.tagline);
    let githubUsername = String(github.username ?? '');
    body.replaceChildren(
      el('p', { class: 'muted' }, t('onboardingStep1Hint')),
      el(
        'div',
        { class: 'row-fields' },
        field(t('profileNameZh'), textInput(name.zh, (v) => { name.zh = v; dirty = true; })),
        field(t('profileNameEn'), textInput(name.en, (v) => { name.en = v; dirty = true; }))
      ),
      el(
        'div',
        { class: 'row-fields' },
        field(t('profileTaglineZh'), textInput(tagline.zh, (v) => { tagline.zh = v; dirty = true; })),
        field(t('profileTaglineEn'), textInput(tagline.en, (v) => { tagline.en = v; dirty = true; }))
      ),
      field(
        t('githubUsername'),
        textInput(githubUsername, (v) => { githubUsername = v; dirty = true; })
      )
    );
    ops.replaceChildren(
      btn(t('onboardingSkipAll'), () => close(t('onboardingSkipped'))),
      el('span', { class: 'topbar-spacer' }),
      btn(t('onboardingSkipStep'), () => go(1)),
      btn(t('onboardingNext'), () => {
        void (async () => {
          applyOnboardingProfile(cfg!, {
            nameZh: name.zh,
            nameEn: name.en,
            taglineZh: tagline.zh,
            taglineEn: tagline.en,
            githubUsername,
          });
          if (dirty && !(await saveCfg())) return;
          go(1);
        })();
      }, 'btn-primary')
    );
    (body.querySelector('input') as HTMLInputElement | null)?.focus();
  };

  // ---- 第 2 步：模块编排（home.layout 勾选 + BGM/联系卡开关）----
  const renderStep2 = (): void => {
    const candidates = listModuleCandidates(cfg!);
    const enabled = new Set(enabledModuleKeys(cfg!));
    let bgmEnabled = (cfg!.bgm as Obj | undefined)?.enabled !== false;
    let contactEnabled = ((cfg!.contact as Obj | undefined)?.intro_card as Obj | undefined)?.enabled !== false;

    const moduleRows = candidates.map((c) => {
      const label = t(BLOCK_LABEL_KEYS[c.block] ?? c.block) + (c.id ? ` · ${c.id}` : '');
      return el(
        'label',
        { class: 'onboarding-module' },
        checkbox(enabled.has(c.key), (v) => {
          if (v) enabled.add(c.key);
          else enabled.delete(c.key);
          dirty = true;
        }),
        el('span', {}, label)
      );
    });
    const featureRows = el(
      'div',
      { class: 'onboarding-modules' },
      el('div', { class: 'side-title onboarding-subtitle' }, t('onboardingOtherFeatures')),
      el(
        'label',
        { class: 'onboarding-module' },
        checkbox(bgmEnabled, (v) => { bgmEnabled = v; dirty = true; }),
        el('span', {}, t('modBgm'))
      ),
      el(
        'label',
        { class: 'onboarding-module' },
        checkbox(contactEnabled, (v) => { contactEnabled = v; dirty = true; }),
        el('span', {}, t('modContact'))
      )
    );

    body.replaceChildren(
      el('p', { class: 'muted' }, t('onboardingStep2Hint')),
      el('div', { class: 'onboarding-modules' }, ...moduleRows),
      featureRows
    );
    ops.replaceChildren(
      btn(t('onboardingSkipAll'), () => close(t('onboardingSkipped'))),
      el('span', { class: 'topbar-spacer' }),
      btn(t('onboardingBack'), () => go(0)),
      btn(t('onboardingSkipStep'), () => go(2)),
      btn(t('onboardingNext'), () => {
        void (async () => {
          applyModuleSelection(cfg!, [...enabled]);
          applyFeatureToggles(cfg!, { bgmEnabled, contactEnabled });
          if (dirty && !(await saveCfg())) return;
          go(2);
        })();
      }, 'btn-primary')
    );
  };

  // ---- 第 3 步：主题色盘 ----
  const renderStep3 = (): void => {
    const current = String(((cfg!.theme as Obj | undefined)?.accent ?? '')).toLowerCase();
    const swatches = el(
      'div',
      { class: 'swatches onboarding-swatches' },
      ...ACCENT_PRESETS.map((hex) => {
        const sw = el('button', {
          class: `swatch${hex === current ? ' on' : ''}`,
          type: 'button',
          title: hex,
          style: `background:${hex}`,
        });
        sw.addEventListener('click', () => {
          if (!applyAccent(cfg!, hex)) return;
          dirty = true;
          document.documentElement.style.setProperty('--accent', hex);
          swatches.querySelectorAll('.swatch').forEach((s) => s.classList.remove('on'));
          sw.classList.add('on');
        });
        return sw;
      })
    );
    body.replaceChildren(
      el('p', { class: 'muted' }, t('onboardingStep3Hint')),
      swatches,
      el(
        'div',
        { class: 'accent-preview' },
        el('a', { href: '#', class: 'preview-link' }, t('previewLinkSample')),
        el('button', { class: 'btn btn-primary', type: 'button' }, t('previewButtonSample'))
      )
    );
    ops.replaceChildren(
      btn(t('onboardingSkipAll'), () => close(t('onboardingSkipped'))),
      el('span', { class: 'topbar-spacer' }),
      btn(t('onboardingBack'), () => go(1)),
      btn(t('onboardingFinish'), () => {
        void (async () => {
          if (dirty && !(await saveCfg())) return;
          finish(t('onboardingDone'));
        })();
      }, 'btn-primary')
    );
  };

  const renderers = [renderStep1, renderStep2, renderStep3];
  const go = (next: number): void => {
    step = next;
    dirty = false;
    error.textContent = '';
    progress.textContent =
      `${t('onboardingStep').replace('{0}', String(step + 1)).replace('{1}', '3')} · ${stepTitles[step]}`;
    renderers[step]();
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close(t('onboardingSkipped'));
  });
  document.addEventListener('keydown', onKeydown);

  const modal = el(
    'div',
    { class: 'modal onboarding-modal', role: 'dialog', 'aria-modal': 'true' },
    el('h3', {}, t('onboardingTitle')),
    el('p', { class: 'muted onboarding-intro' }, t('onboardingIntro')),
    progress,
    body,
    error,
    ops
  );
  overlay.append(modal);
  document.body.append(overlay);

  // 配置加载完成后进入第 1 步；失败时提示并保留关闭出口
  body.replaceChildren(el('p', { class: 'muted' }, t('loading')));
  void api
    .site()
    .then(({ data }) => {
      cfg = data as Obj;
      go(0);
    })
    .catch((e: Error) => {
      body.replaceChildren(el('div', { class: 'error-box' }, `${t('loadFailed')}: ${e.message}`));
      ops.replaceChildren(btn(t('close'), () => close()));
    });
}
