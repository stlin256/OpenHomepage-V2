/**
 * 可视化编辑的配置字段坐标（M12d，docs/specs/12 §2.3）：
 * 仅当 OH_EDIT=1（admin 拉起的 dev server 注入）时，给简单文本字段的输出元素注入
 * data-oh-cfg="<yaml路径>@<lang>"，overlay 点击后原位改字、经 POST /api/config/field 写回。
 * v1 覆盖：站点标题（site.title）、profile 昵称/简介（profile.name/tagline）、
 * 页脚文本（footer.text）、RSS 区块标题（rss.block_title）、流式块标题
 * （streaming_blocks.<id>.title，数组段按元素 id 匹配）。
 * 首页配置区块根元素另注入 data-oh-cfg-block（overlay 点击 → 检查器原生表单）。
 * 生产构建（无 OH_EDIT）一律返回空对象/undefined——产物零注入。
 */

/** data-oh-cfg 属性值（raw HTML 字符串场景用，如 streamEmbedHtml）；非编辑模式返回 undefined */
export function editCfgValue(path: string, lang: string): string | undefined {
  return process.env.OH_EDIT === '1' ? `${path}@${lang}` : undefined;
}

/** data-oh-cfg 属性对象（Astro 元素展开用，如 {...editCfgAttr('site.title', lang)}） */
export function editCfgAttr(path: string, lang: string): Record<string, string> {
  const value = editCfgValue(path, lang);
  return value === undefined ? {} : { 'data-oh-cfg': value };
}

/**
 * data-oh-cfg-block 坐标值（首页配置区块根元素，作为组件 prop 传递；
 * name 形如 profile / github / rss / streaming:<id> / editorial:<id>）。
 * 非编辑模式返回 undefined（组件据此不输出任何属性）。
 */
export function editCfgBlockName(name: string): string | undefined {
  return process.env.OH_EDIT === '1' ? name : undefined;
}
