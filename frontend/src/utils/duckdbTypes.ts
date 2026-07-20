/**
 * DuckDB 类型工具模块 —— 全应用唯一的类型词表与判定入口。
 *
 * 三层原则(与后端 api/core/common/duckdb_types.py 镜像,改动需两侧同步):
 * 1. 机器层(SQL 生成/存储/传输)只使用 DuckDB 规范类型名;
 * 2. 判定层(兼容性/分类)先经 normalizeTypeName 把任何来路的类型名
 *    (DuckDB 别名、MySQL/PG 源库原生名)归一到规范名,再按家族集合判定;
 * 3. UI 层的语义化选项(如粘贴板下拉)是门面,最终仍映射到规范类型。
 *
 * 规范名与别名均以 DuckDB 1.5.3 实测为准(duckdb_types() + typeof() 探测),
 * 不凭记忆增删。禁止在其他文件另建类型名列表——判定一律 import 本模块。
 */

/**
 * 别名/源库原生名 → DuckDB 规范名。
 *
 * 上半部:DuckDB 自身接受的别名(SELECT typeof(CAST(x AS 别名)) 实测归宿)。
 * 注意 INT1/2/4/8 按**字节数**命名:INT8 = 8 字节 = BIGINT,不是 8 位整数。
 * 下半部:联邦场景会出现的源库原生名——表详情接口直读源库 information_schema,
 * 返回 MySQL `datetime`/`bigint unsigned`、PG `timestamp without time zone`
 * 这类字面量(见 timeBound.ts 的教训),必须在边界归一,否则跨库 JOIN 误报类型冲突。
 */
export const DUCKDB_TYPE_ALIASES: Readonly<Record<string, string>> = {
  // —— DuckDB 别名(实测) ——
  INT: 'INTEGER', INT4: 'INTEGER', INT32: 'INTEGER', SIGNED: 'INTEGER',
  INT8: 'BIGINT', INT64: 'BIGINT', LONG: 'BIGINT', OID: 'BIGINT',
  INT2: 'SMALLINT', INT16: 'SMALLINT', SHORT: 'SMALLINT',
  INT1: 'TINYINT',
  INT128: 'HUGEINT',
  UINT8: 'UTINYINT', UINT16: 'USMALLINT', UINT32: 'UINTEGER',
  UINT64: 'UBIGINT', UINT128: 'UHUGEINT',
  FLOAT4: 'FLOAT', REAL: 'FLOAT',
  FLOAT8: 'DOUBLE',
  DEC: 'DECIMAL', NUMERIC: 'DECIMAL',
  CHAR: 'VARCHAR', BPCHAR: 'VARCHAR', TEXT: 'VARCHAR', STRING: 'VARCHAR',
  NVARCHAR: 'VARCHAR',
  DATETIME: 'TIMESTAMP',
  TIMESTAMPTZ: 'TIMESTAMP WITH TIME ZONE',
  TIMETZ: 'TIME WITH TIME ZONE',
  BOOL: 'BOOLEAN', LOGICAL: 'BOOLEAN',
  BYTEA: 'BLOB', BINARY: 'BLOB', VARBINARY: 'BLOB',
  GUID: 'UUID', BITSTRING: 'BIT', VARINT: 'BIGNUM',
  // —— 源库原生名(MySQL / PostgreSQL) ——
  'TIMESTAMP WITHOUT TIME ZONE': 'TIMESTAMP',
  'TIME WITHOUT TIME ZONE': 'TIME',
  'CHARACTER VARYING': 'VARCHAR', CHARACTER: 'VARCHAR',
  'DOUBLE PRECISION': 'DOUBLE',
  MEDIUMINT: 'INTEGER',
  SERIAL: 'INTEGER', BIGSERIAL: 'BIGINT', SMALLSERIAL: 'SMALLINT',
  'TINYINT UNSIGNED': 'UTINYINT', 'SMALLINT UNSIGNED': 'USMALLINT',
  'MEDIUMINT UNSIGNED': 'UINTEGER', 'INT UNSIGNED': 'UINTEGER',
  'INTEGER UNSIGNED': 'UINTEGER', 'BIGINT UNSIGNED': 'UBIGINT',
  TINYTEXT: 'VARCHAR', MEDIUMTEXT: 'VARCHAR', LONGTEXT: 'VARCHAR',
  TINYBLOB: 'BLOB', MEDIUMBLOB: 'BLOB', LONGBLOB: 'BLOB',
};

/**
 * 可用于 TRY_CAST 的安全转换目标(JOIN 类型冲突对话框选项)。
 *
 * 只收录无损或用户明确知情的目标:
 * - VARCHAR 置首:任何值可无损转文本,是 join 键兜底;
 * - 不含 INTEGER(32 位,超界值 TRY_CAST 成 NULL → JOIN 漏匹配);
 * - 不含定长小标度 DECIMAL(如 18,4):精度/标度超限会静默截断;
 *   DECIMAL(38,6) 已覆盖常见金额/计量而不触顶。
 */
export const DUCKDB_CAST_TYPES = [
  'VARCHAR',           // 无损文本比较,首选兜底
  'BIGINT',            // 64位整数
  'DOUBLE',            // 双精度浮点
  'DECIMAL(38,6)',     // 高容量精确小数
  'TIMESTAMP',         // 时间戳
  'DATE',              // 日期
  'BOOLEAN',           // 布尔
] as const;

export type DuckDBCastType = typeof DUCKDB_CAST_TYPES[number];

/** 整数家族(规范名;BIGNUM 为任意精度整数)。 */
const INTEGER_TYPES = new Set([
  'TINYINT', 'SMALLINT', 'INTEGER', 'BIGINT', 'HUGEINT',
  'UTINYINT', 'USMALLINT', 'UINTEGER', 'UBIGINT', 'UHUGEINT',
  'BIGNUM',
]);

/** 浮点家族(规范名)。 */
const FLOAT_TYPES = new Set(['FLOAT', 'DOUBLE']);

/** 字符串家族:归一后只剩 VARCHAR(TEXT/CHAR/STRING 等都是它的别名)。 */
const STRING_TYPES = new Set(['VARCHAR']);

/** 日期时间家族(规范名,含精度变体)。isDateTimeType 的广义"是否时间类"用。 */
const DATETIME_TYPES = new Set([
  'DATE', 'TIME', 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE',
  'TIME WITH TIME ZONE', 'TIMESTAMP_S', 'TIMESTAMP_MS', 'TIMESTAMP_NS',
  'INTERVAL',
]);

/** date/timestamp 家族(可相互比较);与 time 家族互斥。 */
const DATE_LIKE_TYPES = new Set([
  'DATE', 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE',
  'TIMESTAMP_S', 'TIMESTAMP_MS', 'TIMESTAMP_NS',
]);

/** time 家族(只与自身可比,不与 date/timestamp 可比)。 */
const TIME_LIKE_TYPES = new Set(['TIME', 'TIME WITH TIME ZONE']);

/** 可能超出 double 安全整数(2^53)的大整数——与浮点比较会静默塌缩,判不兼容。 */
const LARGE_INT_TYPES = new Set([
  'BIGINT', 'HUGEINT', 'UBIGINT', 'UHUGEINT', 'BIGNUM',
]);

/** 复杂类型(需要精确匹配,不参与家族兼容)。 */
const COMPLEX_TYPES = new Set([
  'ENUM', 'LIST', 'ARRAY', 'MAP', 'STRUCT', 'UNION', 'JSON', 'VARIANT',
  'BLOB', 'BIT', 'UUID', 'GEOMETRY',
]);

/**
 * 标准化类型名:任何来路的类型串 → DuckDB 规范名。
 *
 * 步骤:大写去空 → 数组后缀→ARRAY → 去数字参数括号(保留 WITH TIME ZONE
 * 这类多词后缀,PG 会报 `timestamp(0) without time zone`)→ 截断剩余括号
 * (STRUCT(...)/MAP(...)/ENUM(...))→ 查别名表归一。
 *
 * @example
 * normalizeTypeName('DECIMAL(18,4)')                  // => 'DECIMAL'
 * normalizeTypeName('datetime')                       // => 'TIMESTAMP'   (MySQL)
 * normalizeTypeName('timestamp(0) without time zone') // => 'TIMESTAMP'   (PG)
 * normalizeTypeName('bigint unsigned')                // => 'UBIGINT'     (MySQL)
 * normalizeTypeName('INT8')                           // => 'BIGINT'      (8 字节!)
 * normalizeTypeName('INTEGER[]')                      // => 'ARRAY'
 * normalizeTypeName(null)                             // => 'UNKNOWN'
 */
export function normalizeTypeName(type: string | null | undefined): string {
  if (!type) return 'UNKNOWN';

  let upper = type.trim().toUpperCase();
  if (!upper) return 'UNKNOWN';

  // 数组类型(INTEGER[] / DECIMAL(18,3)[] / VARCHAR[3])
  if (upper.includes('[')) return 'ARRAY';

  // 去掉数字参数括号(DECIMAL(18,4)/VARCHAR(255)/TIMESTAMP(0) WITHOUT TIME ZONE)
  upper = upper.replace(/\(\s*\d[^)]*\)/g, ' ');

  // 复杂类型的结构参数(STRUCT(a INTEGER)/MAP(K,V)/ENUM('a','b'))截断到主名
  const parenIndex = upper.indexOf('(');
  if (parenIndex > 0) upper = upper.substring(0, parenIndex);

  upper = upper.replace(/\s+/g, ' ').trim();
  if (!upper) return 'UNKNOWN';

  return DUCKDB_TYPE_ALIASES[upper] ?? upper;
}

/**
 * 检查两个类型是否兼容(可以直接比较,无需 TRY_CAST)。
 *
 * 输入可为任何来路的类型名(先归一再判定)。兼容语义尽量镜像 DuckDB
 * 的隐式转换规则,不自创第四套标准:
 * 1. 归一后相同(MySQL datetime × DuckDB TIMESTAMP 在此相等);
 * 2. 同家族(整数×整数、浮点×浮点、日期时间×日期时间);
 * 3. 数值跨族(整数/浮点/DECIMAL 互相,DuckDB 自动提升)。
 */
export function areTypesCompatible(leftType: string, rightType: string): boolean {
  const left = normalizeTypeName(leftType);
  const right = normalizeTypeName(rightType);

  // 完全相同(含归一后相同)
  if (left === right) return true;

  // UNKNOWN 与其他类型都不兼容(与自己兼容已在上面处理)
  if (left === 'UNKNOWN' || right === 'UNKNOWN') return false;

  // 复杂类型需要精确匹配(已经在上面检查过)
  if (COMPLEX_TYPES.has(left) || COMPLEX_TYPES.has(right)) {
    return false;
  }

  // 同一类型家族内兼容
  if (INTEGER_TYPES.has(left) && INTEGER_TYPES.has(right)) return true;
  if (FLOAT_TYPES.has(left) && FLOAT_TYPES.has(right)) return true;
  if (STRING_TYPES.has(left) && STRING_TYPES.has(right)) return true;

  // 日期时间不是铁板一块(Codex S-18):date/timestamp 家族内互兼容、time 家族内
  // 互兼容,但 date/timestamp × time 在 DuckDB 里根本不可比(JOIN 直接报错),
  // 不能判为兼容而跳过 cast 对话框。INTERVAL 只与自身兼容(已由 left===right 覆盖)。
  if (DATE_LIKE_TYPES.has(left) && DATE_LIKE_TYPES.has(right)) return true;
  if (TIME_LIKE_TYPES.has(left) && TIME_LIKE_TYPES.has(right)) return true;

  // 数值跨族:一般兼容(DuckDB 自动提升),但大整数(可能 >2^53)× 浮点会把
  // 相邻大整数塌缩到同一 double(Codex S-18),属静默错配 → 判不兼容,强制用户
  // 显式选择转换方式,而非默默跑出错误匹配。
  const numeric = (t: string) =>
    INTEGER_TYPES.has(t) || FLOAT_TYPES.has(t) || t === 'DECIMAL';
  if (numeric(left) && numeric(right)) {
    // 唯一收紧的有损组合:大整数(可能 >2^53)× 浮点,相邻整数会塌缩到同一 double
    // → 强制显式 cast。其余数值跨族(含 DECIMAL×浮点)沿用 DuckDB 自动提升,判兼容。
    const lossy = (a: string, b: string) =>
      LARGE_INT_TYPES.has(a) && FLOAT_TYPES.has(b);
    if (lossy(left, right) || lossy(right, left)) return false;
    return true;
  }

  return false;
}

/**
 * 获取推荐的 TRY_CAST 目标类型。仅在能靠【类型】安全判定时给推荐,否则返回 ''
 * (无安全推荐,交由数据感知推断 / 用户手填决定)。
 *
 * 含字符串/复杂类型/未知组合 → VARCHAR(无损文本比较);双方 date/timestamp 家族 → TIMESTAMP。
 * 数值×数值(被 areTypesCompatible 判冲突的只有大整数×浮点)→ '':任何固定 scale 的
 * DECIMAL 都可能因舍入制造假匹配(如 DOUBLE 1.0000004 舍成 1.000000 = 整数 1),VARCHAR 又
 * 把 1 与 1.0 比成不等丢匹配——类型层面没有安全默认,应由数据感知推断(scale 取自实际数据)
 * 或用户显式选择。含 TIME / date×time 等无法互转的组合落到 VARCHAR。
 */
export function getRecommendedCastType(leftType: string, rightType: string): string {
  const left = normalizeTypeName(leftType);
  const right = normalizeTypeName(rightType);

  if (STRING_TYPES.has(left) || STRING_TYPES.has(right)) {
    return 'VARCHAR';
  }

  if (DATE_LIKE_TYPES.has(left) && DATE_LIKE_TYPES.has(right)) {
    return 'TIMESTAMP';
  }

  if (isNumericType(left) && isNumericType(right)) {
    return '';
  }

  return 'VARCHAR';
}

/**
 * 生成冲突的唯一 key(基于内容而非索引)
 * 这样即使 JOIN 配置顺序变化,已解决的冲突仍然有效
 *
 * @example
 * generateConflictKey('orders', 'id', 'users', 'order_id')
 * // => 'orders.id::users.order_id'
 */
export function generateConflictKey(
  leftLabel: string,
  leftColumn: string,
  rightLabel: string,
  rightColumn: string
): string {
  return `${leftLabel}.${leftColumn}::${rightLabel}.${rightColumn}`.toLowerCase();
}

/**
 * 检查是否为同一列(同表同列名)
 * 用于跳过自连接中同一列的比较
 */
export function isSameColumn(
  leftLabel: string,
  leftColumn: string,
  rightLabel: string,
  rightColumn: string
): boolean {
  return leftLabel.toLowerCase() === rightLabel.toLowerCase() &&
         leftColumn.toLowerCase() === rightColumn.toLowerCase();
}

/**
 * 获取类型的显示名称(用于 UI 展示)
 * 保留原始类型名,包括精度参数
 */
export function getTypeDisplayName(type: string | null | undefined): string {
  if (!type) return 'UNKNOWN';
  return type.toUpperCase().trim();
}

/** 是否数值类型(整数/浮点/DECIMAL/BIGNUM;别名与源库名先归一)。 */
export function isNumericType(type: string): boolean {
  const normalized = normalizeTypeName(type);
  return INTEGER_TYPES.has(normalized) ||
         FLOAT_TYPES.has(normalized) ||
         normalized === 'DECIMAL';
}

/** 是否整数家族(用于过滤器输入校验区分整数/小数)。 */
export function isIntegerType(type: string): boolean {
  return INTEGER_TYPES.has(normalizeTypeName(type));
}

/** 是否字符串类型。 */
export function isStringType(type: string): boolean {
  return STRING_TYPES.has(normalizeTypeName(type));
}

/** 是否日期时间家族(含 TIME/INTERVAL)。 */
export function isDateTimeType(type: string): boolean {
  return DATETIME_TYPES.has(normalizeTypeName(type));
}

/**
 * 是否"日期或时间戳"类型(排除 TIME/INTERVAL)。
 * 图表日期轴、联邦时间边界推荐用这个口径:MySQL datetime/PG
 * timestamp without time zone 归一后同样命中。
 */
export function isDateOrTimestampType(type: string): boolean {
  const normalized = normalizeTypeName(type);
  return normalized === 'DATE' || normalized.startsWith('TIMESTAMP');
}

/**
 * 是否 VARIANT 类型(JSON 单元格渲染用)。
 * 兼容 VARIANT[] / STRUCT(v VARIANT) 等复合形态,故除归一判断外保留子串匹配。
 */
export function isVariantType(type: string): boolean {
  if (normalizeTypeName(type) === 'VARIANT') return true;
  return (type || '').toUpperCase().includes('VARIANT');
}

/** 是否复杂类型。 */
export function isComplexType(type: string): boolean {
  return COMPLEX_TYPES.has(normalizeTypeName(type));
}
