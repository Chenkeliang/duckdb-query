/** 2026-09-08: standalone mysql_query did not attach its saved desktop connection. */
import { describe, expect, it } from 'vitest';
import { extractSQLQueryAliases, parseSQLTableReferences, buildAttachDatabasesFromParsedRefs } from '../sqlUtils';

describe('extractSQLQueryAliases', () => {
  it.each([
    ["SELECT * FROM mysql_query('SORDER', 'SELECT 1')", ['SORDER']],
    ["WITH q AS (SELECT * FROM MYSQL_QUERY(/* alias */ 'SORDER', 'SELECT 1')) SELECT * FROM q", ['SORDER']],
    ["SELECT * FROM mysql_query('SORDER', 'SELECT 1'), mysql_query('Sorting', 'SELECT 2')", ['SORDER', 'Sorting']],
    ["SELECT * FROM mysql_query('SORDER', 'SELECT 1') UNION ALL SELECT * FROM mysql_query('sorder', 'SELECT 2')", ['SORDER']],
    ["SELECT * FROM mysql_query('O''Reilly', 'SELECT 1')", ["O'Reilly"]],
    ["SELECT * FROM mysql_query('SORDER' || '_other', 'SELECT 1')", []],
    ["SELECT * FROM mysql_query(alias, 'SELECT 1')", []],
    ["SELECT * FROM range(2)", []],
    ["SELECT 'mysql_query(''hidden'', ''SELECT 1'')'", []],
    ["SELECT $$mysql_query('hidden', 'SELECT 1')$$", []],
    ["SELECT * FROM mysql_query('SORDER', $$SELECT * FROM mysql_query('hidden', 'SELECT 1')$$)", ['SORDER']],
    ["-- mysql_query('hidden', 'SELECT 1')\nSELECT 1 /* mysql_query('other', 'SELECT 2') */", []],
  ])('extracts only literal connection arguments: %s', (sql, expected) => {
    expect(extractSQLQueryAliases(sql)).toEqual(expected);
  });

  it('adds connections without inventing physical tables for autocomplete', () => {
    const sql = "SELECT * FROM mysql_query('SORDER', 'SELECT 1')";
    const refs = parseSQLTableReferences(sql);
    expect(refs).toEqual([]);
    const result = buildAttachDatabasesFromParsedRefs(refs, [
      { id: 'sorder-id', name: 'SORDER', type: 'mysql' },
    ], extractSQLQueryAliases(sql));
    expect(result.attachDatabases).toEqual([{ alias: 'SORDER', connectionId: 'sorder-id' }]);
    expect(result.unrecognizedPrefixes).toEqual([]);
  });
});


it('preserves table and function aliases of the same saved connection (2026-09-08)', () => {
  const sql = "SELECT * FROM mysql_sorder.orders CROSS JOIN mysql_query('SORDER', 'SELECT 1')";
  expect(buildAttachDatabasesFromParsedRefs(parseSQLTableReferences(sql), [
    { id: 'sorder', name: 'SORDER', type: 'mysql' },
  ], extractSQLQueryAliases(sql)).attachDatabases).toEqual([
    { alias: 'mysql_sorder', connectionId: 'sorder' },
    { alias: 'SORDER', connectionId: 'sorder' },
  ]);
});
