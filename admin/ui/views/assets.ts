/**
 * 素材管理视图：列出 data/assets/，上传（文件选择/拖拽），删除，复制引用路径。
 * 编辑器内粘贴图片走 pages.ts 的 onPasteImage 钩子（同 uploadAsset）。
 */
import { el, btn } from '../dom.ts';
import { api } from '../api.ts';
import type { AppState } from '../main.ts';

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export async function renderAssets(container: HTMLElement, state: AppState): Promise<void> {
  const t = state.t;

  const listWrap = el('div', {});
  const refresh = async () => {
    const { assets } = await api.assets();
    if (assets.length === 0) {
      listWrap.replaceChildren(el('p', { class: 'muted' }, t('assetEmpty')));
      return;
    }
    listWrap.replaceChildren(
      el(
        'table',
        { class: 'asset-table' },
        el(
          'thead',
          {},
          el('tr', {},
            el('th', {}, t('assetName')),
            el('th', {}, t('assetSize')),
            el('th', {}, t('actions')))
        ),
        el(
          'tbody',
          {},
          ...assets.map((a) =>
            el(
              'tr',
              {},
              el('td', {}, el('a', { href: `/api/asset/file?name=${encodeURIComponent(a.name)}`, target: '_blank' }, a.name)),
              el('td', {}, fmtSize(a.size)),
              el(
                'td',
                { class: 'asset-ops' },
                btn(t('copyRef'), () => {
                  void navigator.clipboard
                    .writeText(`assets/${a.name}`)
                    .then(() => state.setStatus(t('copied'), 'ok'));
                }),
                btn(t('remove'), () => {
                  if (!confirm(t('confirmDeleteAsset'))) return;
                  void api
                    .deleteAsset(a.name)
                    .then(() => refresh())
                    .catch((e: Error) => state.setStatus(e.message, 'err'));
                }, 'btn-danger')
              )
            )
          )
        )
      )
    );
  };

  const upload = async (files: File[]) => {
    for (const f of files) {
      try {
        await api.uploadAsset(f.name, await f.arrayBuffer());
      } catch (e) {
        state.setStatus((e as Error).message, 'err');
      }
    }
    await refresh();
  };

  const fileInput = el('input', { type: 'file', multiple: true }) as HTMLInputElement;
  fileInput.addEventListener('change', () => void upload([...(fileInput.files ?? [])]));

  const drop = el('div', { class: 'drop-zone' }, el('p', { class: 'muted' }, t('uploadHint')), fileInput);
  drop.addEventListener('dragover', (e) => e.preventDefault());
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    void upload([...(e.dataTransfer?.files ?? [])]);
  });

  container.replaceChildren(el('h2', { class: 'section-title' }, t('navAssets')), drop, listWrap);
  await refresh();
}
