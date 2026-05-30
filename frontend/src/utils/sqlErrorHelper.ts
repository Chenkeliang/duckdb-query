/**
 * 解析 DuckDB 报错串中内置的「候选项 / 你是不是想找」提示。
 * 纯函数，零依赖、零 LLM —— DuckDB 1.5.3 在列/表找不到时已给出候选。
 */
export interface SqlErrorSuggestion {
  kind: 'column' | 'table';
  /** 报错中写错的名字（可能为空字符串） */
  wrongName: string;
  /** 候选项（至少一个） */
  candidates: string[];
}

export function parseDuckDbErrorSuggestion(
  message: string | null | undefined
): SqlErrorSuggestion | null {
  if (!message) return null;

  // 列：Referenced column "X" not found ... Candidate bindings: "a", "b"
  const colMatch = message.match(/column\s+"([^"]+)"\s+not found/i);
  if (colMatch) {
    const candLine = message.match(/Candidate bindings:\s*(.+)/i);
    const candidates = candLine
      ? Array.from(candLine[1].matchAll(/"([^"]+)"/g)).map((m) => m[1])
      : [];
    if (candidates.length > 0) {
      return { kind: 'column', wrongName: colMatch[1], candidates };
    }
  }

  // 表：Table with name X does not exist! Did you mean "Y"?
  const tblMatch = message.match(/Table with name\s+"?([^"\s]+)"?\s+does not exist/i);
  if (tblMatch) {
    const didMatch = message.match(/Did you mean\s+"([^"]+)"/i);
    if (didMatch) {
      return { kind: 'table', wrongName: tblMatch[1], candidates: [didMatch[1]] };
    }
  }

  return null;
}
