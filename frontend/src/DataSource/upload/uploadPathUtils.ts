/** 上传相关路径/文件名工具（三 Tab 别名互不共用） */

export function stemFromFilename(filename: string): string {
  return filename.replace(/\.[^/.]+$/, "").trim();
}

export function stemFromUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const pathname = new URL(trimmed).pathname;
    const segment = pathname.split("/").filter(Boolean).pop() || "";
    return stemFromFilename(segment);
  } catch {
    const segment = trimmed.split("/").filter(Boolean).pop() || trimmed;
    return stemFromFilename(segment);
  }
}
