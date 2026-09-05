/**
 * 发布视图（spec 21）：一键构建（阶段指示 + 滚动日志）→ dist 静态预览 → OG 分享卡预览。
 * 构建/预览状态轮询（离开视图时 cleanup 停止）；构建进程与预览服务都在服务端管理，
 * 刷新页面后重新进入视图会继续显示进行中的构建。
 */
import { el, btn } from '../dom.ts';
import {
  api,
  type BuildStatus,
  type DistPreviewStatus,
  type PageMeta,
} from '../api.ts';
import type { AppState } from '../main.ts';

/** 构建阶段 id → i18n 键（阶段清单由服务端 /api/build/status 下发） */
const STAGE_LABEL_KEYS: Record<string, string> = {
  fonts: 'buildStageFonts',
  og: 'buildStageOg',
  astro: 'buildStageAstro',
  css: 'buildStageCss',
  images: 'buildStageImages',
};

export async function renderPublish(
  container: HTMLElement,
  state: AppState
): Promise<() => void> {
  const t = state.t;

  // ---- 构建卡片 ----
  const buildStatusEl = el('p', { class: 'muted' }, t('buildIdle'));
  const stageRow = el('div', { class: 'build-stages' });
  const logEl = el('pre', { class: 'build-log' }, t('buildLogEmpty'));
  const startBtn = btn(t('buildStart'), () => void doStartBuild(), 'btn-primary');
  const stopBtn = btn(t('buildStop'), () => void doStopBuild());
  stopBtn.style.display = 'none';

  const renderBuild = (s: BuildStatus) => {
    const label =
      s.status === 'running'
        ? t('buildRunning')
        : s.status === 'success'
          ? t('buildSuccess')
          : s.status === 'failed'
            ? `${t('buildFailed')}${s.error ? `：${s.error}` : ''}`
            : t('buildIdle');
    buildStatusEl.textContent = label;
    buildStatusEl.className =
      s.status === 'success' ? 'muted build-ok' : s.status === 'failed' ? 'form-error' : 'muted';
    startBtn.disabled = s.status === 'running';
    stopBtn.style.display = s.status === 'running' ? '' : 'none';
    stageRow.replaceChildren(
      ...s.stages.map((id, i) =>
        el(
          'span',
          {
            class: `build-stage${
              s.status === 'running' && i === s.stageIndex
                ? ' active'
                : s.status === 'success' || (s.stageIndex >= 0 && i < s.stageIndex)
                  ? ' done'
                  : ''
            }`,
          },
          t(STAGE_LABEL_KEYS[id] ?? id)
        )
      )
    );
    const log = s.logTail.join('\n');
    logEl.textContent = log || t('buildLogEmpty');
    logEl.scrollTop = logEl.scrollHeight;
  };

  const doStartBuild = async () => {
    try {
      renderBuild(await api.buildStart());
    } catch (e) {
      state.setStatus((e as Error).message, 'err');
    }
  };
  const doStopBuild = async () => {
    try {
      renderBuild(await api.buildStop());
    } catch (e) {
      state.setStatus((e as Error).message, 'err');
    }
  };

  // ---- dist 预览卡片 ----
  const previewStatusEl = el('p', { class: 'muted' }, t('distPreviewStopped'));
  const previewToggleBtn = btn(t('distPreviewStart'), () => void doTogglePreview(), 'btn-primary');
  const openLink = el(
    'a',
    { class: 'btn', href: '#', target: '_blank', rel: 'noopener' },
    t('distPreviewOpen')
  ) as HTMLAnchorElement;
  openLink.style.display = 'none';
  let previewUp = false;

  const renderPreview = (s: DistPreviewStatus) => {
    previewUp = s.up;
    previewStatusEl.textContent = s.up
      ? `${t('distPreviewRunning')}${s.managed ? '' : ` ${t('distPreviewExternal')}`}`
      : (s.error ?? t('distPreviewStopped'));
    previewStatusEl.className = s.error && !s.up ? 'form-error' : 'muted';
    previewToggleBtn.textContent = s.up && s.managed ? t('distPreviewStop') : t('distPreviewStart');
    if (s.up && s.url) {
      openLink.href = s.url;
      openLink.style.display = '';
    } else {
      openLink.style.display = 'none';
    }
  };

  const doTogglePreview = async () => {
    try {
      renderPreview(previewUp ? await api.previewStop() : await api.previewStart());
    } catch (e) {
      state.setStatus((e as Error).message, 'err');
    }
  };

  // ---- OG 分享卡预览卡片 ----
  const pageSel = el('select', { class: 'input' }) as HTMLSelectElement;
  const ogResult = el('div', { class: 'og-preview-box' });
  let ogObjectUrl: string | null = null;

  const renderOg = (svg: string, title: string) => {
    if (ogObjectUrl) URL.revokeObjectURL(ogObjectUrl);
    ogObjectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    ogResult.replaceChildren(
      el('img', { src: ogObjectUrl, alt: title, class: 'og-preview-img' }),
      el(
        'div',
        { class: 'modal-ops' },
        el('a', { class: 'btn', href: ogObjectUrl, target: '_blank', rel: 'noopener' }, t('ogOpenTab'))
      )
    );
  };

  const doGenerateOg = async () => {
    const [lang, file] = (pageSel.value || '/').split('/');
    if (!lang || !file) return;
    try {
      const r = await api.ogPreview(lang, file);
      if (r.custom) {
        // 页面自定义 og_image：构建期会跳过生成，直接引用素材
        const assetName = r.custom.replace(/^assets\//, '');
        ogResult.replaceChildren(
          el('p', { class: 'muted' }, t('ogCustom')),
          el(
            'a',
            { class: 'btn', href: `/api/asset/file?name=${encodeURIComponent(assetName)}`, target: '_blank', rel: 'noopener' },
            r.custom
          )
        );
      } else if (r.svg) {
        renderOg(r.svg, r.title);
      }
      state.setStatus(t('saved'), 'ok');
    } catch (e) {
      state.setStatus((e as Error).message, 'err');
    }
  };

  container.replaceChildren(
    el('h2', { class: 'section-title' }, t('publishTitle')),
    el('p', { class: 'muted' }, t('publishHint')),

    el('h3', { class: 'section-title' }, t('buildSection')),
    buildStatusEl,
    stageRow,
    el('div', { class: 'modal-ops' }, startBtn, stopBtn),
    logEl,

    el('h3', { class: 'section-title' }, t('distPreviewSection')),
    previewStatusEl,
    el('div', { class: 'modal-ops' }, previewToggleBtn, openLink),

    el('h3', { class: 'section-title' }, t('ogSection')),
    el('p', { class: 'muted' }, t('ogHint')),
    el('div', { class: 'modal-ops og-generate-row' }, pageSel, btn(t('ogGenerate'), () => void doGenerateOg(), 'btn-primary')),
    ogResult
  );

  // OG 页面下拉：复用页面清单
  try {
    const { pages } = await api.pages();
    pageSel.replaceChildren(
      ...pages.map((p: PageMeta) =>
        el('option', { value: `${p.lang}/${p.file}` }, `${p.lang}/${p.file} — ${p.title || p.file}`)
      )
    );
  } catch {
    /* 页面列表加载失败不阻塞构建/预览 */
  }

  // 轮询：构建 1.2s（进行中界面实时），预览 3s；离开视图 cleanup
  let stopped = false;
  const pollBuild = async () => {
    try {
      renderBuild(await api.buildStatus());
    } catch {
      /* 状态读取失败静默，下一轮重试 */
    }
  };
  const pollPreview = async () => {
    try {
      renderPreview(await api.previewStatus());
    } catch {
      /* 同上 */
    }
  };
  await Promise.all([pollBuild(), pollPreview()]);
  const buildTimer = setInterval(() => {
    if (!stopped) void pollBuild();
  }, 1200);
  const previewTimer = setInterval(() => {
    if (!stopped) void pollPreview();
  }, 3000);

  return () => {
    stopped = true;
    clearInterval(buildTimer);
    clearInterval(previewTimer);
    if (ogObjectUrl) URL.revokeObjectURL(ogObjectUrl);
  };
}
