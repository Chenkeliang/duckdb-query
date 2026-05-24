import type { TableSource } from '@/hooks/useQueryWorkspace';
import type { DatabaseConnection } from '@/hooks/useDatabaseConnections';
import {
  generateDatabaseAlias,
  parseSQLTableReferences,
  buildAttachDatabasesFromParsedRefs,
} from '@/utils/sqlUtils';

/** 从 SQL 推断联邦查询 attach 配置（可能较慢，应在弹窗打开后异步执行） */
export function detectFederatedPreviewSource(
  sqlBody: string,
  connections: DatabaseConnection[]
): TableSource | undefined {
  let attachDatabases: { alias: string; connectionId: string }[] = [];
  const federatedMatch = sqlBody.match(/-- 联邦查询: (.+)/);

  if (federatedMatch) {
    const dbAliases = federatedMatch[1].split(',').map((s) => s.trim());
    attachDatabases = dbAliases
      .map((alias) => {
        const exactMatch = connections.find((c) => generateDatabaseAlias(c) === alias);
        if (exactMatch) return { alias, connectionId: exactMatch.id };
        const partialMatch = connections.find((c) =>
          alias.startsWith(generateDatabaseAlias(c))
        );
        if (partialMatch) return { alias, connectionId: partialMatch.id };
        return { alias, connectionId: 'unknown' };
      })
      .filter((db) => db.connectionId !== 'unknown');
  }

  if (attachDatabases.length === 0) {
    try {
      const parsedRefs = parseSQLTableReferences(sqlBody);
      const autoDetected = buildAttachDatabasesFromParsedRefs(parsedRefs, connections);
      attachDatabases = autoDetected.attachDatabases;
    } catch (e) {
      console.error('Failed to auto-detect federated sources:', e);
    }
  }

  if (attachDatabases.length > 0) {
    return { type: 'federated', attachDatabases };
  }
  return undefined;
}
