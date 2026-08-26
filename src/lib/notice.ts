/**
 * 页面通知横幅（Notice Banner）：页面控件之一，
 * 支持 4 种颜色模式（accent / yellow / red / custom），
 * 页面加载后延迟 0.5s（500ms）弹出，支持内联 markdown 链接、加粗、行内代码，
 * 危险协议与不完整语法安全转义。
 */
import { escapeHtml } from "./html.ts";

export type NoticeColor = "accent" | "yellow" | "red" | "custom" | string;

export interface PageNotice {
  text: string;
  /** 颜色风格：accent（主题色）| yellow（黄色）| red（红色）| custom（自定义）或合法颜色代码 */
  color?: NoticeColor;
  /** 自定义颜色值（当 color 为 custom 或直接传十六进制颜色时） */
  customColor?: string;
  /** 延迟显示时间（毫秒），缺省 500ms（0.5s） */
  delay?: number;
}

const INLINE_FORMAT_RE = /(\[([^\]]*)\]\(([^)\s]*)\)|\*\*([^*]+)\*\*|`([^`]+)`)/g;
const SAFE_HREF_RE = /^(https?:\/\/|mailto:|\/|#)/i;

/**
 * 将通知横幅文本转换为安全 HTML。
 */
export function noticeTextToHtml(text: string): string {
  if (!text) return "";
  let out = "";
  let last = 0;
  for (const m of text.matchAll(INLINE_FORMAT_RE)) {
    const idx = m.index ?? 0;
    out += escapeHtml(text.slice(last, idx));
    const full = m[0];
    if (full.startsWith("[")) {
      const label = m[2];
      const url = m[3];
      if (url && SAFE_HREF_RE.test(url)) {
        const isExternal = /^https?:\/\//i.test(url);
        const targetAttr = isExternal ? " target=\"_blank\" rel=\"noopener\"" : "";
        out += `<a href="${escapeHtml(url)}"${targetAttr}>${escapeHtml(label)}</a>`;
      } else {
        out += escapeHtml(full);
      }
    } else if (full.startsWith("**")) {
      out += `<strong>${escapeHtml(m[4])}</strong>`;
    } else if (full.startsWith("`")) {
      out += `<code>${escapeHtml(m[5])}</code>`;
    } else {
      out += escapeHtml(full);
    }
    last = idx + full.length;
  }
  return out + escapeHtml(text.slice(last));
}

/**
 * 归一化 frontmatter 中的 notice 配置。
 * 支持纯字符串（如 notice: "提示文案"）以及结构化对象（如 notice: { text: "...", color: "yellow", delay: 500 }）。
 */
export function normalizeNotice(raw: unknown): PageNotice | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return null;
    return { text, color: "accent", delay: 500 };
  }
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const rawText = String(obj.text ?? obj.content ?? obj.message ?? "").trim();
    if (!rawText) return null;
    const rawColor = String(obj.color ?? obj.variant ?? obj.type ?? "accent").trim();
    let color: NoticeColor = "accent";
    let customColor: string | undefined = undefined;

    if (rawColor === "yellow" || rawColor === "warning") {
      color = "yellow";
    } else if (rawColor === "red" || rawColor === "danger" || rawColor === "error") {
      color = "red";
    } else if (rawColor === "accent" || rawColor === "theme" || rawColor === "primary") {
      color = "accent";
    } else if (/^#(?:[0-9a-fA-F]{3}){1,2}$/.test(rawColor) || /^rgb/i.test(rawColor)) {
      color = "custom";
      customColor = rawColor;
    } else if (rawColor === "custom") {
      color = "custom";
      customColor = typeof obj.customColor === "string" ? obj.customColor : typeof obj.custom_color === "string" ? obj.custom_color : undefined;
    } else {
      color = rawColor;
    }

    const rawDelay = Number(obj.delay);
    const delay = Number.isFinite(rawDelay) && rawDelay >= 0 ? rawDelay : 500;

    return {
      text: rawText,
      color,
      customColor,
      delay,
    };
  }
  return null;
}

/**
 * 解析颜色类名及自定义样式变量。
 */
export function resolveNoticeColorClass(
  color?: NoticeColor,
  customColor?: string
): { colorClass: string; customStyle?: string } {
  if (color === "yellow" || color === "warning") {
    return { colorClass: "notice-color-yellow" };
  }
  if (color === "red" || color === "danger" || color === "error") {
    return { colorClass: "notice-color-red" };
  }
  if (color === "custom" || (typeof color === "string" && /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(color))) {
    const c = customColor || (typeof color === "string" && color.startsWith("#") ? color : undefined);
    return {
      colorClass: "notice-color-custom",
      customStyle: c ? `--banner-custom-color: ${c};` : undefined,
    };
  }
  return { colorClass: "notice-color-accent" };
}
