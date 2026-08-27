/**
 * 首页配置区块的原生表单面板（M12d，docs/specs/12 §2.3/§3）：点击
 * [data-oh-cfg-block] 区块 → 右侧检查器（inspector.openPanel）显示对应配置表单。
 * 表单段构建复用 admin/ui/configforms.ts（与 admin 配置视图同一份实现）；
 * 读写走现有 GET/PUT /api/config/site|rss（读全量 → 表单直接改对象 → PUT 全量，
 * 沿用服务端 schema 校验 + 快照）→ 成功由调用方整页刷新。
 * editorial 的组件列表（actions/list/tiles/archive）完整移植成本高，面板内只覆盖
 * 主字段，另给「在后台编辑」深链（新标签打开 admin 对应配置页）。
 */
import { el } from '../dom.ts';
import {
  buildProfileForm,
  buildGithubForm,
  buildRssForm,
  buildStreamingBlockCard,
  buildEditorialMainFields,
  type Obj,
} from '../configforms.ts';
import type { CfgBlockEntry } from './scanner.ts';

export interface CfgPanelDeps {
  t: (k: string) => string;
  loadSite: () => Promise<Obj>;
  saveSite: (data: Obj) => Promise<unknown>;
  loadRss: () => Promise<Obj>;
  saveRss: (data: Obj) => Promise<unknown>;
  /** 素材引用值列表（assets/<name>；头像下拉候选，失败降级空列表 → 文本输入） */
  loadAssets?: () => Promise<string[]>;
  /** admin origin（editorial 面板的「在后台编辑」深链） */
  adminOrigin: string;
  /** 保存执行器（顶栏状态 + 成功刷新，main 的 runSave）；失败抛错由顶栏显示 */
  runSave: (action: () => Promise<unknown>) => Promise<void>;
  /** 取消（关闭检查器） */
  onCancel: () => void;
}

/** 在 body 中渲染配置区块表单（异步：先取配置再建表单） */
export async function renderCfgBlockForm(
  body: HTMLElement,
  entry: CfgBlockEntry,
  deps: CfgPanelDeps
): Promise<void> {
  const { t } = deps;
  body.replaceChildren(el('p', { class: 'oh-inspector-hint' }, t('loading')));

  // 表单直接改写这两个对象；保存时按涉及的文件 PUT
  const site = await deps.loadSite();
  const rss = entry.kind === 'rss' ? await deps.loadRss() : null;
  let assets: string[] = [];
  if (entry.kind === 'profile') {
    assets = await (deps.loadAssets?.() ?? Promise.resolve([])).catch(() => []);
  }
  // 保存按钮统一提交（touch 无需逐项通知）
  const formDeps = { t, touch: () => {}, assets };

  let fields: HTMLElement[];
  let save: () => Promise<unknown>;
  switch (entry.kind) {
    case 'profile': {
      const profile = (site.profile ??= {}) as Obj;
      fields = buildProfileForm(profile, formDeps);
      save = () => deps.saveSite(site);
      break;
    }
    case 'github': {
      const gh = (site.github ??= {}) as Obj;
      fields = buildGithubForm(gh, formDeps);
      save = () => deps.saveSite(site);
      break;
    }
    case 'rss': {
      const siteRss = (site.rss ??= {}) as Obj;
      fields = buildRssForm(siteRss, rss ?? {}, formDeps);
      save = () =>
        Promise.all([deps.saveSite(site), deps.saveRss(rss ?? {})]).then(() => undefined);
      break;
    }
    case 'streaming': {
      const blocks = (site.streaming_blocks ??= []) as Obj[];
      const blk = blocks.find((b) => b.id === entry.id);
      if (!blk) {
        body.replaceChildren(el('p', { class: 'oh-inspector-hint' }, t('cfgBlockMissing')));
        return;
      }
      fields = [buildStreamingBlockCard(blk, formDeps)];
      save = () => deps.saveSite(site);
      break;
    }
    case 'editorial': {
      const blocks = (site.editorial_blocks ??= []) as Obj[];
      const blk = blocks.find((b) => b.id === entry.id);
      if (!blk) {
        body.replaceChildren(el('p', { class: 'oh-inspector-hint' }, t('cfgBlockMissing')));
        return;
      }
      fields = [buildEditorialMainFields(blk, formDeps)];
      save = () => deps.saveSite(site);
      break;
    }
  }

  const saveBtn = el('button', { type: 'button', class: 'oh-primary' }, t('save')) as HTMLButtonElement;
  saveBtn.addEventListener('click', () => void deps.runSave(save));
  const cancelBtn = el('button', { type: 'button' }, t('cancel')) as HTMLButtonElement;
  cancelBtn.addEventListener('click', () => deps.onCancel());

  const nodes: HTMLElement[] = [...fields];
  // editorial 的组件列表（按钮组/列表卡/磁贴/归档卡）在后台配置页编辑（深链新标签）
  if (entry.kind === 'editorial' && deps.adminOrigin) {
    const link = el(
      'a',
      { class: 'oh-admin-link', href: `${deps.adminOrigin}/#/config/editorial`, target: '_blank', rel: 'noopener' },
      t('editInAdmin')
    );
    nodes.push(el('p', { class: 'oh-inspector-hint' }, link));
  }
  nodes.push(el('div', { class: 'oh-inspector-ops' }, saveBtn, cancelBtn));
  body.replaceChildren(...nodes);
}
