import { describe, it, expect } from "vitest";
import {
  noticeTextToHtml,
  normalizeNotice,
  resolveNoticeColorClass,
} from "../src/lib/notice.ts";

describe("noticeTextToHtml", () => {
  it("空文本返回空字符串", () => {
    expect(noticeTextToHtml("")).toBe("");
  });

  it("纯文本原样输出", () => {
    expect(noticeTextToHtml("本页面为示例页面，内容仅为展现项目特性使用。")).toBe(
      "本页面为示例页面，内容仅为展现项目特性使用。"
    );
  });

  it("支持站内相对链接", () => {
    expect(noticeTextToHtml("查看 [特性说明](/features) 了解更多")).toBe(
      '查看 <a href="/features">特性说明</a> 了解更多'
    );
  });

  it("外链自动添加 target=_blank 与 rel=noopener", () => {
    expect(noticeTextToHtml("项目源码：[GitHub](https://github.com/stlin256/OpenHomepage-V2)")).toBe(
      '项目源码：<a href="https://github.com/stlin256/OpenHomepage-V2" target="_blank" rel="noopener">GitHub</a>'
    );
  });

  it("支持加粗与行内代码", () => {
    expect(noticeTextToHtml("这是 **重要提示** 与 `notice` 字段")).toBe(
      "这是 <strong>重要提示</strong> 与 <code>notice</code> 字段"
    );
  });

  it("危险 HTML 标签与危险协议自动转义或保留纯文本", () => {
    expect(noticeTextToHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    );
    expect(noticeTextToHtml("[点击](javascript:alert(1))")).toBe(
      "[点击](javascript:alert(1))"
    );
  });
});

describe("normalizeNotice", () => {
  it("字符串格式归一化为默认 accent 与 500ms 延迟", () => {
    expect(normalizeNotice("测试提示")).toEqual({
      text: "测试提示",
      color: "accent",
      delay: 500,
    });
  });

  it("对象格式支持 text/color/delay 配置", () => {
    expect(
      normalizeNotice({
        text: "黄色警告",
        color: "yellow",
        delay: 600,
      })
    ).toEqual({
      text: "黄色警告",
      color: "yellow",
      delay: 600,
      customColor: undefined,
    });
  });

  it("支持 4 种颜色：accent, yellow, red, custom/hex", () => {
    expect(normalizeNotice({ text: "T", color: "warning" })?.color).toBe("yellow");
    expect(normalizeNotice({ text: "T", color: "danger" })?.color).toBe("red");
    expect(normalizeNotice({ text: "T", color: "accent" })?.color).toBe("accent");
    const custom = normalizeNotice({ text: "T", color: "#ff8800" });
    expect(custom?.color).toBe("custom");
    expect(custom?.customColor).toBe("#ff8800");
  });

  it("空内容或空对象返回 null", () => {
    expect(normalizeNotice("")).toBeNull();
    expect(normalizeNotice({})).toBeNull();
    expect(normalizeNotice({ text: "   " })).toBeNull();
  });
});

describe("resolveNoticeColorClass", () => {
  it("yellow 映射到 notice-color-yellow", () => {
    expect(resolveNoticeColorClass("yellow")).toEqual({
      colorClass: "notice-color-yellow",
    });
  });

  it("red 映射到 notice-color-red", () => {
    expect(resolveNoticeColorClass("red")).toEqual({
      colorClass: "notice-color-red",
    });
  });

  it("custom 带十六进制颜色输出 CSS 变量", () => {
    expect(resolveNoticeColorClass("custom", "#10b981")).toEqual({
      colorClass: "notice-color-custom",
      customStyle: "--banner-custom-color: #10b981;",
    });
  });

  it("缺省映射到 notice-color-accent", () => {
    expect(resolveNoticeColorClass("accent")).toEqual({
      colorClass: "notice-color-accent",
    });
    expect(resolveNoticeColorClass()).toEqual({
      colorClass: "notice-color-accent",
    });
  });
});
