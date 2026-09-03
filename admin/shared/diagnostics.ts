/**
 * Markdown 内容与指令语法诊断哨兵（Diagnostics & Linting）：
 * 1. 检查 YAML Frontmatter 完整性（必需字段如 title）；
 * 2. 检查本地素材引用（assets/...）在磁盘中是否存在；
 * 3. 检查自定义指令参数完整性（::stream id, ::ghcard repo, ::bilibili bvid 等）；
 * 4. 检查容器指令开闭闭合匹配（:::note ... :::, ::::grid ... ::::）。
 */

export interface DiagnosticItem {
  type: "error" | "warning";
  message: string;
  line?: number;
  fixSuggestion?: string;
}

export interface DiagnosticsResult {
  valid: boolean;
  errors: DiagnosticItem[];
  warnings: DiagnosticItem[];
}

export function lintMarkdownContent(
  markdown: string,
  frontmatter: Record<string, unknown>,
  availableAssets: Set<string>
): DiagnosticsResult {
  const errors: DiagnosticItem[] = [];
  const warnings: DiagnosticItem[] = [];

  // 1. Frontmatter 检查
  if (!frontmatter.title || String(frontmatter.title).trim() === "") {
    errors.push({
      type: "error",
      message: "页面缺少必需的标题 (title)",
      fixSuggestion: "请在上方表单中填写页面标题",
    });
  }

  // 2. 正文与指令行扫描
  const lines = markdown.split("\n");
  const containerStack: { name: string; colons: number; line: number }[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // 检查本地静态资源引用
    const assetMatches = line.matchAll(/(?:src|cover|image|poster)=["']([^"']+)["']|!\[[^\]]*\]\(([^)]+)\)/g);
    for (const match of assetMatches) {
      const target = match[1] ?? match[2] ?? "";
      if (target.startsWith("assets/")) {
        const assetName = target.slice("assets/".length).split(/[?#]/)[0];
        if (availableAssets.size > 0 && !availableAssets.has(assetName)) {
          warnings.push({
            type: "warning",
            message: `引用了不存在的本地素材：${target}`,
            line: lineNum,
            fixSuggestion: `请检查文件名或在「素材」面板上传 ${assetName}`,
          });
        }
      }
    }

    // 检查指令参数
    if (trimmed.startsWith("::stream{") && !/id=["'][^"']+["']/.test(trimmed)) {
      errors.push({
        type: "error",
        message: "::stream 指令缺少必需参数 id",
        line: lineNum,
        fixSuggestion: "例如：::stream{id=\"welcome\"}",
      });
    }

    if (trimmed.startsWith("::ghcard{") && !/repo=["'][^"']+["']/.test(trimmed)) {
      errors.push({
        type: "error",
        message: "::ghcard 指令缺少必需参数 repo",
        line: lineNum,
        fixSuggestion: "例如：::ghcard{repo=\"owner/repo\"}",
      });
    }

    if (trimmed.startsWith("::bilibili{") && !/bvid=["'][^"']+["']/.test(trimmed)) {
      errors.push({
        type: "error",
        message: "::bilibili 指令缺少必需参数 bvid",
        line: lineNum,
        fixSuggestion: "例如：::bilibili{bvid=\"BV13z421U7cs\"}",
      });
    }

    if (trimmed.startsWith("::youtube{") && !/id=["'][^"']+["']/.test(trimmed)) {
      errors.push({
        type: "error",
        message: "::youtube 指令缺少必需参数 id",
        line: lineNum,
        fixSuggestion: "例如：::youtube{id=\"aircAruvnKk\"}",
      });
    }

    if (trimmed.startsWith(":::figure{") && !/src=["'][^"']+["']/.test(trimmed)) {
      errors.push({
        type: "error",
        message: ":::figure 指令缺少必需参数 src",
        line: lineNum,
        fixSuggestion: "例如：:::figure{src=\"assets/photo.jpg\" caption=\"说明\"}",
      });
    }

    // 容器指令入栈与出栈配对
    const openMatch = trimmed.match(/^(:{3,4})([a-z0-9_-]+)/);
    if (openMatch) {
      containerStack.push({ name: openMatch[2], colons: openMatch[1].length, line: lineNum });
    } else {
      const closeMatch = trimmed.match(/^(:{3,4})$/);
      if (closeMatch) {
        if (containerStack.length === 0) {
          warnings.push({
            type: "warning",
            message: `有多余的闭合标记 ${closeMatch[1]}`,
            line: lineNum,
          });
        } else {
          const top = containerStack[containerStack.length - 1];
          if (top.colons === closeMatch[1].length) {
            containerStack.pop();
          } else {
            warnings.push({
              type: "warning",
              message: `闭合冒号数量不匹配：期望 ${top.colons} 个，实际 ${closeMatch[1].length} 个`,
              line: lineNum,
            });
          }
        }
      }
    }
  }

  for (const unclosed of containerStack) {
    errors.push({
      type: "error",
      message: `容器指令 ${":".repeat(unclosed.colons)}${unclosed.name} 未闭合`,
      line: unclosed.line,
      fixSuggestion: `请在指令末尾补充 ${":".repeat(unclosed.colons)}`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
