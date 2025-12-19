/**
 * SQL Tokenizer - 轻量级 SQL 词法分析器
 *
 * 用于从 SQL 字符串中提取 token 流，支持：
 * - 跳过单行注释 (--)
 * - 跳过多行注释
 * - 跳过字符串字面量 ('...')
 * - 处理引号标识符 ("...", `...`, [...])
 * - 识别 SQL 关键字
 * - 识别标识符、点号、括号
 */

// Token 类型
export type TokenType =
  | 'keyword'      // SQL 关键字 (FROM, JOIN, AS, WITH, ON, WHERE, etc.)
  | 'identifier'   // 标识符 (表名、列名等)
  | 'dot'          // 点号 (.)
  | 'lparen'       // 左括号 (
  | 'rparen'       // 右括号 )
  | 'comma'        // 逗号 ,
  | 'semicolon'    // 分号 ;
  | 'operator'     // 运算符 (=, <, >, etc.)
  | 'number'       // 数字
  | 'string'       // 字符串字面量
  | 'whitespace'   // 空白（通常跳过）
  | 'unknown';     // 未知

// Token 结构
export interface Token {
  type: TokenType;
  value: string;
  /** 原始值（对于引号标识符，保留引号） */
  raw: string;
  /** 在原始 SQL 中的位置 */
  position: number;
}

// SQL 关键字集合（用于表引用解析）
const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER',
  'CROSS', 'ON', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS',
  'NULL', 'TRUE', 'FALSE', 'AS', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT',
  'OFFSET', 'UNION', 'INTERSECT', 'EXCEPT', 'ALL', 'DISTINCT', 'WITH',
  'RECURSIVE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE',
  'TABLE', 'VIEW', 'INDEX', 'DROP', 'ALTER', 'ADD', 'COLUMN', 'PRIMARY', 'KEY',
  'FOREIGN', 'REFERENCES', 'CONSTRAINT', 'DEFAULT', 'CHECK', 'UNIQUE', 'CASE',
  'WHEN', 'THEN', 'ELSE', 'END', 'CAST', 'OVER', 'PARTITION', 'ROWS', 'RANGE',
  'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'CURRENT', 'ROW', 'NATURAL', 'USING',
]);

/**
 * SQL Tokenizer 类
 */
export class SQLTokenizer {
  private sql: string;
  private pos: number = 0;
  private length: number;

  constructor(sql: string) {
    this.sql = sql;
    this.length = sql.length;
  }

  /**
   * 将 SQL 字符串转换为 token 流
   */
  tokenize(): Token[] {
    const tokens: Token[] = [];
    this.pos = 0;

    while (this.pos < this.length) {
      const token = this.nextToken();
      if (token && token.type !== 'whitespace') {
        tokens.push(token);
      }
    }

    return tokens;
  }

  /**
   * 获取下一个 token
   */
  private nextToken(): Token | null {
    this.skipWhitespace();
    if (this.pos >= this.length) return null;

    const startPos = this.pos;
    const char = this.sql[this.pos];

    // 单行注释 --
    if (char === '-' && this.peek(1) === '-') {
      this.skipSingleLineComment();
      return null;
    }

    // 多行注释 /* */
    if (char === '/' && this.peek(1) === '*') {
      this.skipMultiLineComment();
      return null;
    }

    // 字符串字面量 '...'
    if (char === "'") {
      return this.readString();
    }

    // 双引号标识符 "..."
    if (char === '"') {
      return this.readQuotedIdentifier('"', '"');
    }

    // 反引号标识符 `...`
    if (char === '`') {
      return this.readQuotedIdentifier('`', '`');
    }

    // 方括号标识符 [...]
    if (char === '[') {
      return this.readQuotedIdentifier('[', ']');
    }

    // 点号
    if (char === '.') {
      this.pos++;
      return { type: 'dot', value: '.', raw: '.', position: startPos };
    }

    // 括号
    if (char === '(') {
      this.pos++;
      return { type: 'lparen', value: '(', raw: '(', position: startPos };
    }
    if (char === ')') {
      this.pos++;
      return { type: 'rparen', value: ')', raw: ')', position: startPos };
    }

    // 逗号
    if (char === ',') {
      this.pos++;
      return { type: 'comma', value: ',', raw: ',', position: startPos };
    }

    // 分号
    if (char === ';') {
      this.pos++;
      return { type: 'semicolon', value: ';', raw: ';', position: startPos };
    }

    // 数字
    if (this.isDigit(char)) {
      return this.readNumber();
    }

    // 标识符或关键字
    if (this.isIdentifierStart(char)) {
      return this.readIdentifierOrKeyword();
    }

    // 运算符
    if (this.isOperatorChar(char)) {
      return this.readOperator();
    }

    // 未知字符，跳过
    this.pos++;
    return { type: 'unknown', value: char, raw: char, position: startPos };
  }

  /**
   * 跳过空白字符
   */
  private skipWhitespace(): void {
    while (this.pos < this.length && this.isWhitespace(this.sql[this.pos])) {
      this.pos++;
    }
  }

  /**
   * 跳过单行注释
   */
  private skipSingleLineComment(): void {
    this.pos += 2; // 跳过 --
    while (this.pos < this.length && this.sql[this.pos] !== '\n') {
      this.pos++;
    }
    if (this.pos < this.length) {
      this.pos++; // 跳过换行符
    }
  }

  /**
   * 跳过多行注释
   */
  private skipMultiLineComment(): void {
    this.pos += 2; // 跳过 /*
    while (this.pos < this.length - 1) {
      if (this.sql[this.pos] === '*' && this.sql[this.pos + 1] === '/') {
        this.pos += 2;
        return;
      }
      this.pos++;
    }
    // 未闭合的注释，跳到末尾
    this.pos = this.length;
  }

  /**
   * 读取字符串字面量
   */
  private readString(): Token {
    const startPos = this.pos;
    this.pos++; // 跳过开始引号
    let value = '';

    while (this.pos < this.length) {
      const char = this.sql[this.pos];
      if (char === "'") {
        // 检查是否是转义的引号 ''
        if (this.peek(1) === "'") {
          value += "'";
          this.pos += 2;
        } else {
          this.pos++; // 跳过结束引号
          break;
        }
      } else {
        value += char;
        this.pos++;
      }
    }

    const raw = this.sql.slice(startPos, this.pos);
    return { type: 'string', value, raw, position: startPos };
  }

  /**
   * 读取引号标识符
   */
  private readQuotedIdentifier(openQuote: string, closeQuote: string): Token {
    const startPos = this.pos;
    this.pos++; // 跳过开始引号
    let value = '';

    while (this.pos < this.length) {
      const char = this.sql[this.pos];
      if (char === closeQuote) {
        // 检查是否是转义的引号
        if (this.peek(1) === closeQuote) {
          value += closeQuote;
          this.pos += 2;
        } else {
          this.pos++; // 跳过结束引号
          break;
        }
      } else {
        value += char;
        this.pos++;
      }
    }

    const raw = this.sql.slice(startPos, this.pos);
    return { type: 'identifier', value, raw, position: startPos };
  }

  /**
   * 读取数字
   */
  private readNumber(): Token {
    const startPos = this.pos;
    let value = '';

    while (this.pos < this.length) {
      const char = this.sql[this.pos];
      if (this.isDigit(char) || char === '.' || char === 'e' || char === 'E') {
        value += char;
        this.pos++;
      } else {
        break;
      }
    }

    return { type: 'number', value, raw: value, position: startPos };
  }

  /**
   * 读取标识符或关键字
   */
  private readIdentifierOrKeyword(): Token {
    const startPos = this.pos;
    let value = '';

    while (this.pos < this.length && this.isIdentifierChar(this.sql[this.pos])) {
      value += this.sql[this.pos];
      this.pos++;
    }

    const upperValue = value.toUpperCase();
    const type: TokenType = SQL_KEYWORDS.has(upperValue) ? 'keyword' : 'identifier';

    return { type, value, raw: value, position: startPos };
  }

  /**
   * 读取运算符
   */
  private readOperator(): Token {
    const startPos = this.pos;
    let value = this.sql[this.pos];
    this.pos++;

    // 处理多字符运算符
    const nextChar = this.sql[this.pos];
    if (nextChar && this.isOperatorChar(nextChar)) {
      const twoChar = value + nextChar;
      if (['<=', '>=', '<>', '!=', '||', '&&', '::'].includes(twoChar)) {
        value = twoChar;
        this.pos++;
      }
    }

    return { type: 'operator', value, raw: value, position: startPos };
  }

  /**
   * 查看后续字符
   */
  private peek(offset: number): string | undefined {
    return this.sql[this.pos + offset];
  }

  /**
   * 判断是否是空白字符
   */
  private isWhitespace(char: string): boolean {
    return /\s/.test(char);
  }

  /**
   * 判断是否是数字
   */
  private isDigit(char: string): boolean {
    return /[0-9]/.test(char);
  }

  /**
   * 判断是否是标识符起始字符
   */
  private isIdentifierStart(char: string): boolean {
    return /[a-zA-Z_]/.test(char);
  }

  /**
   * 判断是否是标识符字符
   */
  private isIdentifierChar(char: string): boolean {
    return /[a-zA-Z0-9_]/.test(char);
  }

  /**
   * 判断是否是运算符字符
   */
  private isOperatorChar(char: string): boolean {
    return /[=<>!+\-*/%&|^~:]/.test(char);
  }
}

/**
 * 便捷函数：将 SQL 字符串转换为 token 流
 */
export function tokenizeSQL(sql: string): Token[] {
  const tokenizer = new SQLTokenizer(sql);
  return tokenizer.tokenize();
}
