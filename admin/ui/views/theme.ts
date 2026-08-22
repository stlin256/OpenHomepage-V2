/**
 * 主题取色器：读头像 → canvas 提取 4-6 候选主色 + 点击头像像素取色 + 手动 hex。
 * 选定写回 site.yaml theme.accent，并即时热更新编辑器内 --accent 预览。
 * 头像缺失时优雅降级为仅手动输入。
 */
import { el, btn, textInput, select, field } from '../dom.ts';
import { api } from '../api.ts';
import { normalizeHex, extractPalette } from '../../shared/color.ts';
import { createAutosave } from '../../shared/autosave.ts';
import type { AppState } from '../main.ts';

type Obj = Record<string, unknown>;

export async function renderThemePicker(container: HTMLElement, state: AppState): Promise<void> {
  const t = state.t;
  const { data } = await api.site();
  const cfg = data as Obj;
  const theme = (cfg.theme ??= {}) as Obj;
  const profile = (cfg.profile ?? {}) as Obj;

  const autosave = createAutosave(800, () => {
    state.setStatus(t('saving'));
    void api
      .saveSite(cfg)
      .then(() => state.setStatus(t('saved'), 'ok'))
      .catch((e: Error) => state.setStatus(`${t('saveFailed')}: ${e.message}`, 'err'));
  });

  const preview = el(
    'div',
    { class: 'accent-preview' },
    el('a', { href: '#', class: 'preview-link' }, 'accent link / 链接示例'),
    el('button', { class: 'btn btn-primary', type: 'button' }, 'accent button')
  );

  const applyAccent = (hex: string) => {
    const n = normalizeHex(hex);
    if (!n) {
      state.setStatus(t('invalidHex'), 'err');
      return;
    }
    theme.accent = n;
    document.documentElement.style.setProperty('--accent', n);
    hexInput.value = n;
    autosave.touch();
  };

  const hexInput = textInput(String(theme.accent ?? ''), () => undefined, '#3a7bd5');
  const manualRow = el(
    'div',
    { class: 'row-fields' },
    field(t('manualHex'), hexInput),
    btn(t('applyColor'), () => applyAccent(hexInput.value), 'btn-primary')
  );

  const paletteWrap = el('div', { class: 'palette' });
  const avatarWrap = el('div', { class: 'avatar-pick' });

  // ---- 头像候选色 + 点取 ----
  const avatarPath = String(profile.avatar ?? '');
  const avatarName = avatarPath.split('/').pop() ?? '';
  let avatarLoaded = false;
  if (avatarName) {
    const img = new Image();
    img.src = `/api/asset/file?name=${encodeURIComponent(avatarName)}`;
    img.alt = 'avatar';
    try {
      await img.decode();
      avatarLoaded = true;
      const canvas = el('canvas', { class: 'avatar-canvas' }) as HTMLCanvasElement;
      const scale = Math.min(1, 240 / img.naturalWidth);
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx2d = canvas.getContext('2d')!;
      ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height);
      avatarWrap.append(el('p', { class: 'muted' }, t('clickToPick')), canvas);

      canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width);
        const y = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height);
        const d = ctx2d.getImageData(x, y, 1, 1).data;
        if (d[3] < 128) return;
        applyAccent(pixelToHex(d));
      });

      const palette = extractPalette(ctx2d.getImageData(0, 0, canvas.width, canvas.height).data, 6);
      paletteWrap.append(el('p', { class: 'muted' }, t('candidateColors')));
      const swatches = el('div', { class: 'swatches' });
      for (const hex of palette) {
        const sw = el('button', {
          class: 'swatch',
          type: 'button',
          title: hex,
          style: `background:${hex}`,
        });
        sw.addEventListener('click', () => applyAccent(hex));
        swatches.append(sw);
      }
      paletteWrap.append(swatches);
    } catch {
      avatarLoaded = false;
    }
  }
  if (!avatarLoaded) {
    avatarWrap.append(el('p', { class: 'muted' }, t('avatarMissing')));
  }

  if (typeof theme.accent === 'string') {
    document.documentElement.style.setProperty('--accent', theme.accent);
  }

  container.replaceChildren(
    el('h2', { class: 'section-title' }, t('configTheme')),
    el(
      'div',
      { class: 'form-grid' },
      field(
        t('themeDefaultMode'),
        select(
          [
            { value: 'system', label: t('modeSystem') },
            { value: 'light', label: t('modeLight') },
            { value: 'dark', label: t('modeDark') },
          ],
          String(theme.default_mode ?? 'system'),
          (v) => {
            theme.default_mode = v;
            autosave.touch();
          }
        )
      )
    ),
    el('h3', {}, t('themeAccent')),
    manualRow,
    paletteWrap,
    avatarWrap,
    preview
  );
}

/** 从 canvas 像素数据算 hex 色值 */
export function pixelToHex(data: Uint8ClampedArray): string {
  return `#${[data[0], data[1], data[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
