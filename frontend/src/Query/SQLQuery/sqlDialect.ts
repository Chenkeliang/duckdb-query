/**
 * DuckDB SQL 方言。
 * 注意：StandardSQL.spec.keywords 为 undefined（define({}) 未写入 spec），
 * 不能用它拼接；须基于带完整词表的方言（如 PostgreSQL）。
 */
import { PostgreSQL, SQLDialect } from '@codemirror/lang-sql';

export const duckDBDialect = SQLDialect.define({
  charSetCasts: true,
  doubleDollarQuotedStrings: true,
  operatorChars: PostgreSQL.spec.operatorChars,
  specialVar: '',
  keywords:
    PostgreSQL.spec.keywords +
    ' copy export import pivot unpivot qualify sample tablesample attach detach',
  types:
    PostgreSQL.spec.types +
    ' hugeint utinyint usmallint uinteger ubigint',
  builtin: 'read_csv read_parquet read_json list_value struct_pack',
});
