/**
 * 数据库连接类型 → Lucide 图标 的统一映射。
 *
 * SQLite 官方标志是羽毛 → Feather;DuckDB 是鸭子 → Bird(Lucide 无鸭子,最接近)。
 * 服务器型数据库(MySQL/PostgreSQL/SQL Server)保持通用 Database 图标。
 * 侧栏连接树与数据源页共用本映射,避免两处各自为政。
 */
import { Bird, Database, Feather, type LucideIcon } from 'lucide-react';

export const DATABASE_TYPE_ICONS: Record<string, LucideIcon> = {
  mysql: Database,
  postgresql: Database,
  sqlserver: Database,
  sqlite: Feather,
  duckdb: Bird,
};

export function getDatabaseTypeIcon(type: string): LucideIcon {
  return DATABASE_TYPE_ICONS[type] ?? Database;
}
