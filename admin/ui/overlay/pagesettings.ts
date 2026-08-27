/**
 * 页面设置面板（M12d，docs/specs/12 §3）：顶栏「页面设置」→ 右侧检查器显示当前页
 * frontmatter 表单（标题/slug/nav/order/描述/notice，字段与 admin 页面视图一致）。
 * 读取走 GET /api/page（body 原样带回），保存走 PUT /api/page（只动 frontmatter，
 * body 原样回传）；保存成功由调用方整页刷新（§2.6）。
 * 空值约定与 admin 页面视图一致：slug/描述/order 留空由服务端序列化时丢弃
 * （slug 回落文件名）；notice 留空删键，accent 色存纯字符串。
 */
import { el, textInput, numberInput, checkbox, select, field } from '../dom.ts';

export interface PageSettingsDeps {
  t: (k: string) => string;
  /** 读取当前页（frontmatter + body 原文） */
  loadPage: () => Promise<{ frontmatter: Record<string, unknown>; body: string }>;
  /** 保存（frontmatter 改动 + 原 body 不动）；抛错 = 失败（面板保持打开） */
  onSave: (frontmatter: Record<string, unknown>, body: string) => Promise<void>;
  /** 取消（关闭检查器） */
  onCancel: () => void;
}

/** 在 body 中渲染当前页 frontmatter 表单（异步：先取页面再建表单） */
export async function renderPageSettings(
  body: HTMLElement,
  deps: PageSettingsDeps
): Promise<void> {
  const { t } = deps;
  body.replaceChildren(el('p', { class: 'oh-inspector-hint' }, t('loading')));
  const page = await deps.loadPage();
  // 以服务端 frontmatter 为底（未在表单内的键原样保留），表单字段覆盖
  const fm: Record<string, unknown> = { nav: true, ...page.frontmatter };

  const titleInput = textInput(String(fm.title ?? ''), () => {});
  const slugInput = textInput(String(fm.slug ?? ''), () => {});
  const navInput = checkbox(Boolean(fm.nav), () => {});
  let orderValue = typeof fm.order === 'number' ? fm.order : undefined;
  const orderInput = numberInput(orderValue, (v) => { orderValue = v; });
  const descInput = textInput(String(fm.description ?? ''), () => {});

  // notice：纯字符串 = accent 色文本；{text,color} = 指定颜色（与 admin 页面视图同规则）
  let noticeText = '';
  let noticeColor = 'accent';
  if (typeof fm.notice === 'string') {
    noticeText = fm.notice;
  } else if (typeof fm.notice === 'object' && fm.notice !== null) {
    const no = fm.notice as Record<string, unknown>;
    noticeText = String(no.text ?? no.content ?? '');
    noticeColor = String(no.color ?? 'accent');
  }
  const noticeTextInput = textInput(noticeText, () => {});
  const noticeColorSelect = select(
    [
      { value: 'accent', label: t('noticeColorAccent') },
      { value: 'yellow', label: t('noticeColorYellow') },
      { value: 'red', label: t('noticeColorRed') },
      { value: 'custom', label: t('noticeColorCustom') },
    ],
    noticeColor,
    () => {}
  );

  const save = async (): Promise<void> => {
    const next: Record<string, unknown> = { ...page.frontmatter };
    next.title = titleInput.value;
    next.slug = slugInput.value;
    next.nav = navInput.checked;
    next.order = orderValue;
    next.description = descInput.value;
    const text = noticeTextInput.value.trim();
    const color = noticeColorSelect.value;
    if (!text) delete next.notice;
    else if (color === 'accent' || !color) next.notice = text;
    else next.notice = { text, color };
    await deps.onSave(next, page.body);
  };

  const saveBtn = el('button', { type: 'button', class: 'oh-primary' }, t('save')) as HTMLButtonElement;
  saveBtn.addEventListener('click', () => void save());
  const cancelBtn = el('button', { type: 'button' }, t('cancel')) as HTMLButtonElement;
  cancelBtn.addEventListener('click', () => deps.onCancel());

  body.replaceChildren(
    field(t('frontmatterTitle'), titleInput),
    field(t('frontmatterSlug'), slugInput),
    field(t('frontmatterNav'), navInput),
    field(t('frontmatterOrder'), orderInput),
    field(t('frontmatterDescription'), descInput),
    field(t('frontmatterNotice'), noticeTextInput),
    field(t('frontmatterNoticeColor'), noticeColorSelect),
    el('div', { class: 'oh-inspector-ops' }, saveBtn, cancelBtn)
  );
}
