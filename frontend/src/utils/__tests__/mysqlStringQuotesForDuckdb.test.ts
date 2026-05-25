import { describe, expect, it } from 'vitest';
import { normalizeMysqlDoubleQuotedStringsForDuckdb } from '../mysqlStringQuotesForDuckdb';

describe('normalizeMysqlDoubleQuotedStringsForDuckdb', () => {
  it('converts IN list double-quoted values to single quotes', () => {
    const sql =
      "SELECT * FROM t WHERE state NOT IN (\"TRADE_BUYER_SIGNED\",\"TRADE_CLOSED\")";
    expect(normalizeMysqlDoubleQuotedStringsForDuckdb(sql)).toBe(
      "SELECT * FROM t WHERE state NOT IN ('TRADE_BUYER_SIGNED','TRADE_CLOSED')"
    );
  });

  it('keeps qualified double-quoted identifiers', () => {
    const sql = 'SELECT * FROM "mysql_sorder"."iget_order"';
    expect(normalizeMysqlDoubleQuotedStringsForDuckdb(sql)).toBe(sql);
  });

  it('converts comparison rhs double quotes', () => {
    const sql = 'SELECT * FROM t WHERE state = "OPEN"';
    expect(normalizeMysqlDoubleQuotedStringsForDuckdb(sql)).toBe(
      "SELECT * FROM t WHERE state = 'OPEN'"
    );
  });

  it('converts user federated IN clause pattern', () => {
    const sql =
      "SELECT * FROM mysql_sorder.iget_order where update_time >='2026-05-21 22:00:00' and state not in(\"TRADE_BUYER_SIGNED\",\"TRADE_CLOSED_BY_USER\",\"TRADE_CLOSED\") LIMIT 10000";
    const out = normalizeMysqlDoubleQuotedStringsForDuckdb(sql);
    expect(out).toContain(
      "not in('TRADE_BUYER_SIGNED','TRADE_CLOSED_BY_USER','TRADE_CLOSED')"
    );
    expect(out).not.toContain('"TRADE_BUYER_SIGNED"');
  });

  it('escapes single quotes inside converted literals', () => {
    const sql = 'SELECT 1 WHERE x IN ("O\'Reilly")';
    expect(normalizeMysqlDoubleQuotedStringsForDuckdb(sql)).toBe(
      "SELECT 1 WHERE x IN ('O''Reilly')"
    );
  });
});
