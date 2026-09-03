/**
 * 从源 Markdown 提取排版骨架（保留指令、媒体、代码块与结构容器，将正文段落替换为翻译占位）。
 */
export function generatePageSkeleton(sourceBody: string): string {
  const lines = sourceBody.split("\n");
  const skeletonLines: string[] = [];

  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      skeletonLines.push(line);
      continue;
    }

    if (inCodeBlock) {
      skeletonLines.push(line);
      continue;
    }

    // 指令行 (:::, ::::, ::)
    if (trimmed.startsWith(":::") || trimmed.startsWith("::::") || trimmed.startsWith("::")) {
      skeletonLines.push(line);
      continue;
    }

    // 标题行
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      skeletonLines.push(`${headingMatch[1]} ${headingMatch[2]} [待翻译]`);
      continue;
    }

    // 表格或空行
    if (trimmed.startsWith("|") || trimmed === "") {
      skeletonLines.push(line);
      continue;
    }

    skeletonLines.push(line);
  }

  return skeletonLines.join("\n");
}
