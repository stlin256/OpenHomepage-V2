/**
 * 页脚（spec 01 §footer）：默认开启（footer.enabled 显式 false 才关闭），
 * 文本支持内联 markdown 链接 [label](url)（轻量解析 + sanitize：仅 http(s)/mailto，
 * 其余原样输出转义文本）。默认内容 Powered by OpenHomepage-V2（带仓库链接）。
 */
import { escapeHtml } from './html.ts';
import type { LocalizedText, SiteConfig } from './config.ts';

export const FOOTER_REPO_URL = 'https://github.com/stlin256/OpenHomepage-V2';

/** 默认页脚内容（常用语言）：OpenHomepage-V2 链接到项目仓库；未列语言经 resolveText 回退英文 */
export const DEFAULT_FOOTER_TEXT: Record<string, string> = {
  zh: `由 [OpenHomepage-V2](${FOOTER_REPO_URL}) 驱动`,
  en: `Powered by [OpenHomepage-V2](${FOOTER_REPO_URL})`,
  ja: `Powered by [OpenHomepage-V2](${FOOTER_REPO_URL})`,
  fr: `Propulsé par [OpenHomepage-V2](${FOOTER_REPO_URL})`,
  de: `Betrieben mit [OpenHomepage-V2](${FOOTER_REPO_URL})`,
  es: `Desarrollado con [OpenHomepage-V2](${FOOTER_REPO_URL})`,
  ko: `[OpenHomepage-V2](${FOOTER_REPO_URL}) 제공`,
  pt: `Desenvolvido com [OpenHomepage-V2](${FOOTER_REPO_URL})`,
  ru: `На базе [OpenHomepage-V2](${FOOTER_REPO_URL})`,
  it: `Powered by [OpenHomepage-V2](${FOOTER_REPO_URL})`,
  nl: `Aangedreven door [OpenHomepage-V2](${FOOTER_REPO_URL})`,
  tr: `[OpenHomepage-V2](${FOOTER_REPO_URL}) ile geliştirildi`,
  vi: `Sử dụng [OpenHomepage-V2](${FOOTER_REPO_URL})`,
  th: `ขับเคลื่อนโดย [OpenHomepage-V2](${FOOTER_REPO_URL})`,
  id: `Didukung oleh [OpenHomepage-V2](${FOOTER_REPO_URL})`,
  ar: `مدعوم بواسطة [OpenHomepage-V2](${FOOTER_REPO_URL})`,
  hi: `[OpenHomepage-V2](${FOOTER_REPO_URL}) द्वारा संचालित`,
};

/**
 * 页脚配置归一化：footer 段缺失 / enabled 未显式 false → 开启；
 * text 缺省 → 默认内容。显式 enabled:false → null（不渲染）。
 */
export function resolveFooter(site: SiteConfig): { text: LocalizedText } | null {
  const f = site.footer;
  if (f && f.enabled === false) return null;
  const text = f?.text;
  return { text: typeof text === 'string' || (text && typeof text === 'object') ? text : DEFAULT_FOOTER_TEXT };
}

/** 内联链接语法：[label](url)；url 不允许空白/右括号 */
const LINK_RE = /\[([^\]]*)\]\(([^)\s]*)\)/g;

/** 允许的链接协议（防 javascript:/data: 注入） */
const SAFE_HREF_RE = /^(https?:\/\/|mailto:)/i;

/**
 * 页脚文本 → HTML：整体转义，仅把合法的 [label](http…|mailto:…) 转为
 * <a target="_blank" rel="noopener">；危险协议与不完整语法原样保留为文本。
 */
export function footerTextToHtml(text: string): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const idx = m.index ?? 0;
    out += escapeHtml(text.slice(last, idx));
    const [, label, url] = m;
    if (url && SAFE_HREF_RE.test(url)) {
      out += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
    } else {
      out += escapeHtml(m[0]);
    }
    last = idx + m[0].length;
  }
  return out + escapeHtml(text.slice(last));
}
