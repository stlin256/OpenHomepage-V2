/**
 * 新手欢迎向导（spec 19 + spec 22 §3）：四步卡片弹窗（场景预设 → 个人名片 → 模块编排 → 主题色盘）。
 * 首次初始化 data/ 时自动弹出，也可由顶栏「🚀 新手向导」随时重开；
 * 完成或任何跳过/关闭路径都会写 data/.onboarding-done 标记（POST /api/onboarding/done），不再自动弹出。
 * 所有保存走既有 PUT /api/config/site（schema 校验 + 快照），配置改写逻辑在 shared/onboarding.ts；
 * 第 0 步场景预设只产出第 2 步模块勾选的默认值（shared/scene-presets.ts，数据源与 CLI setup 共享），
 * 语言裁剪不做进向导——完成页给「前往语言管理」入口。
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
  githubPrefillSuggestions,
  applyGithubBlogLink,
  ACCENT_PRESETS,
  type Obj,
} from '../../shared/onboarding.ts';
import { sceneDefaults, SCENE_PRESET_KEYS, type SceneDefaults } from '../../shared/scene-presets.ts';
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

/** 第 0 步场景卡片的 i18n 键（标签 + 描述） */
const SCENE_LABEL_KEYS: Record<string, { label: string; desc: string }> = {
  academic: { label: 'sceneAcademic', desc: 'sceneAcademicDesc' },
  developer: { label: 'sceneDeveloper', desc: 'sceneDeveloperDesc' },
  creator: { label: 'sceneCreator', desc: 'sceneCreatorDesc' },
  minimal: { label: 'sceneMinimal', desc: 'sceneMinimalDesc' },
  custom: { label: 'sceneCustom', desc: 'sceneCustomDesc' },
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

  const stepTitles = [
    t('onboardingStep0Title'),
    t('onboardingStep1Title'),
    t('onboardingStep2Title'),
    t('onboardingStep3Title'),
  ];
  /** 第 0 步选定的场景默认值；进入第 2 步首次渲染时消费（消费后置空，回退再进不覆盖用户改动） */
  let pendingScene: SceneDefaults | null = null;

  // ---- 第 0 步：场景预设（spec 22 §3）----
  const renderStep0 = (): void => {
    let selected = 'custom';
    const cards = SCENE_PRESET_KEYS.map((key) => {
      const radio = el('input', { type: 'radio', name: 'onboarding-scene', value: key }) as HTMLInputElement;
      radio.checked = key === selected;
      const card = el(
        'label',
        { class: `onboarding-module scene-card${key === selected ? ' on' : ''}` },
        radio,
        el(
          'span',
          { class: 'scene-card-text' },
          el('span', {}, t(SCENE_LABEL_KEYS[key].label)),
          el('span', { class: 'scene-card-desc' }, t(SCENE_LABEL_KEYS[key].desc))
        )
      );
      radio.addEventListener('change', () => {
        selected = key;
        body.querySelectorAll('.scene-card').forEach((c) => c.classList.remove('on'));
        card.classList.add('on');
      });
      return card;
    });

    body.replaceChildren(
      el('p', { class: 'muted' }, t('onboardingStep0Hint')),
      el('div', { class: 'onboarding-modules' }, ...cards)
    );
    ops.replaceChildren(
      btn(t('onboardingSkipAll'), () => close(t('onboardingSkipped'))),
      el('span', { class: 'topbar-spacer' }),
      btn(t('onboardingNext'), () => {
        // 选定场景 → 作为第 2 步模块勾选的默认值（custom/未知为 null，保持当前配置）
        pendingScene = sceneDefaults(selected);
        go(1);
      }, 'btn-primary')
    );
  };

  // ---- 第 1 步：个人名片 ----
  const renderStep1 = (): void => {
    const profile = (cfg!.profile ?? {}) as Obj;
    const github = (cfg!.github ?? {}) as Obj;
    const name = locParts(profile.name);
    const tagline = locParts(profile.tagline);
    let githubUsername = String(github.username ?? '');
    // 各输入框「用户已手改」标记：GitHub 预填只覆盖空字段或未手改字段（策略见 shared/onboarding.ts）
    const touched = { nameZh: false, nameEn: false, taglineZh: false, taglineEn: false };
    const nameZhInput = textInput(name.zh, (v) => { name.zh = v; touched.nameZh = true; dirty = true; });
    const nameEnInput = textInput(name.en, (v) => { name.en = v; touched.nameEn = true; dirty = true; });
    const taglineZhInput = textInput(tagline.zh, (v) => { tagline.zh = v; touched.taglineZh = true; dirty = true; });
    const taglineEnInput = textInput(tagline.en, (v) => { tagline.en = v; touched.taglineEn = true; dirty = true; });

    // 「同步 GitHub 头像」行（spec 19 §3.2）：预填成功且拿到 avatarUrl 后追加；
    // 与文字预填相互独立（头像同步失败就地提示，不影响已预填的文字，也不打断向导）。
    // 服务端落盘 data/assets/ 并写回 site.yaml，成功后本地 cfg 同步 profile.avatar
    // 并置 dirty（随后「保存并继续」统一保存），预览换成本地新头像路径
    let avatarRow: HTMLElement | null = null;
    const showAvatarRow = (avatarUrl: string): void => {
      if (avatarRow) return;
      const preview = el('img', {
        class: 'onboarding-avatar-preview',
        src: avatarUrl,
        alt: t('profileAvatar'),
      }) as HTMLImageElement;
      const avatarBtn = btn(t('onboardingAvatarSync'), () => {
        void (async () => {
          const username = githubUsername.trim();
          if (!username) {
            error.textContent = t('onboardingGithubNeedUsername');
            return;
          }
          error.textContent = '';
          avatarBtn.disabled = true; // loading 态防重复点击
          avatarBtn.textContent = t('onboardingAvatarSyncing');
          try {
            const { avatar } = await api.githubAvatar(username);
            ((cfg!.profile ??= {}) as Obj).avatar = avatar;
            dirty = true;
            // 预览从远程 URL 换为刚落盘的本地文件（t 参数破缓存）
            const name = avatar.split('/').pop() ?? avatar;
            preview.src = `/api/asset/file?name=${encodeURIComponent(name)}&t=${Date.now()}`;
            state.setStatus(t('onboardingAvatarDone').replace('{0}', avatar), 'ok');
          } catch (e) {
            error.textContent = (e as Error).message;
          } finally {
            avatarBtn.disabled = false;
            avatarBtn.textContent = t('onboardingAvatarSync');
          }
        })();
      });
      avatarRow = el('div', { class: 'onboarding-avatar-row' }, preview, avatarBtn);
      body.append(avatarRow);
    };

    // 「⚡ 自动同步信息」：调 GET /api/github/prefill 拉公开资料预填表单；失败就地提示，不打断向导
    const syncBtn = btn(t('onboardingGithubSync'), () => {
      void (async () => {
        const username = githubUsername.trim();
        if (!username) {
          error.textContent = t('onboardingGithubNeedUsername');
          return;
        }
        error.textContent = '';
        syncBtn.disabled = true; // loading 态防重复点击
        syncBtn.textContent = t('onboardingGithubSyncing');
        try {
          const gh = await api.githubPrefill(username);
          const patch = githubPrefillSuggestions(
            { nameZh: name.zh, nameEn: name.en, taglineZh: tagline.zh, taglineEn: tagline.en },
            touched,
            gh
          );
          let filled = false;
          if (patch.nameZh !== undefined) { name.zh = patch.nameZh; nameZhInput.value = patch.nameZh; filled = true; }
          if (patch.nameEn !== undefined) { name.en = patch.nameEn; nameEnInput.value = patch.nameEn; filled = true; }
          if (patch.taglineZh !== undefined) { tagline.zh = patch.taglineZh; taglineZhInput.value = patch.taglineZh; filled = true; }
          if (patch.taglineEn !== undefined) { tagline.en = patch.taglineEn; taglineEnInput.value = patch.taglineEn; filled = true; }
          // 博客/主页链接并入 site.yaml 的 profile.links 社交链接（去重，已存在则不动）
          if (applyGithubBlogLink(cfg!, gh.blog)) filled = true;
          if (filled) dirty = true;
          // 拿到头像地址则追加「同步头像」行（独立于文字预填，可跳过）
          if (gh.avatarUrl) showAvatarRow(gh.avatarUrl);
          state.setStatus(t('onboardingGithubSyncDone'), 'ok');
        } catch (e) {
          error.textContent = (e as Error).message;
        } finally {
          syncBtn.disabled = false;
          syncBtn.textContent = t('onboardingGithubSync');
        }
      })();
    });

    body.replaceChildren(
      el('p', { class: 'muted' }, t('onboardingStep1Hint')),
      el(
        'div',
        { class: 'row-fields' },
        field(t('profileNameZh'), nameZhInput),
        field(t('profileNameEn'), nameEnInput)
      ),
      el(
        'div',
        { class: 'row-fields' },
        field(t('profileTaglineZh'), taglineZhInput),
        field(t('profileTaglineEn'), taglineEnInput)
      ),
      field(
        t('githubUsername'),
        el(
          'div',
          { class: 'onboarding-github-row' },
          textInput(githubUsername, (v) => { githubUsername = v; dirty = true; }),
          syncBtn
        )
      )
    );
    ops.replaceChildren(
      btn(t('onboardingSkipAll'), () => close(t('onboardingSkipped'))),
      el('span', { class: 'topbar-spacer' }),
      btn(t('onboardingSkipStep'), () => go(2)),
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
          go(2);
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

    // 消费第 0 步的场景默认值：只调 github/rss 勾选与 BGM/联系卡开关，其余保持配置现状
    if (pendingScene) {
      const d = pendingScene;
      pendingScene = null;
      if (d.modules.github) enabled.add('github');
      else enabled.delete('github');
      if (d.modules.rss) enabled.add('rss');
      else enabled.delete('rss');
      bgmEnabled = d.bgmEnabled;
      contactEnabled = d.contactEnabled;
      dirty = true;
    }

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
      btn(t('onboardingBack'), () => go(1)),
      btn(t('onboardingSkipStep'), () => go(3)),
      btn(t('onboardingNext'), () => {
        void (async () => {
          applyModuleSelection(cfg!, [...enabled]);
          applyFeatureToggles(cfg!, { bgmEnabled, contactEnabled });
          if (dirty && !(await saveCfg())) return;
          go(3);
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
    // 语言裁剪不做进向导（spec 22 §3）：完成页给「前往语言管理」入口，点击=保存+完成+跳转
    const gotoLanguages = el('a', { href: '#/config/languages', class: 'preview-link' }, t('onboardingGotoLanguages'));
    gotoLanguages.addEventListener('click', (e) => {
      e.preventDefault();
      void (async () => {
        if (dirty && !(await saveCfg())) return;
        finish(t('onboardingDone'));
        state.navigate('#/config/languages');
      })();
    });
    body.replaceChildren(
      el('p', { class: 'muted' }, t('onboardingStep3Hint')),
      swatches,
      el(
        'div',
        { class: 'accent-preview' },
        el('a', { href: '#', class: 'preview-link' }, t('previewLinkSample')),
        el('button', { class: 'btn btn-primary', type: 'button' }, t('previewButtonSample'))
      ),
      el('p', { class: 'muted' }, t('onboardingLangHint') + ' ', gotoLanguages)
    );
    ops.replaceChildren(
      btn(t('onboardingSkipAll'), () => close(t('onboardingSkipped'))),
      el('span', { class: 'topbar-spacer' }),
      btn(t('onboardingBack'), () => go(2)),
      btn(t('onboardingFinish'), () => {
        void (async () => {
          if (dirty && !(await saveCfg())) return;
          finish(t('onboardingDone'));
        })();
      }, 'btn-primary')
    );
  };

  const renderers = [renderStep0, renderStep1, renderStep2, renderStep3];
  const go = (next: number): void => {
    step = next;
    dirty = false;
    error.textContent = '';
    progress.textContent =
      `${t('onboardingStep').replace('{0}', String(step + 1)).replace('{1}', String(renderers.length))} · ${stepTitles[step]}`;
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
