/**
 * SQL 执行错误 → 引擎兼容性自愈 匹配表
 *
 * 目前只覆盖「SQLite 类型不一致」这一种已验证场景：ATTACH 的 SQLite 库存在
 * 声明类型与实际存储不符的脏数据，DuckDB 报错固定形如
 * `Mismatch Type Error: ...` 且提示 `SET sqlite_all_varchar=true`。
 *
 * 以后要接入新场景（MySQL 非法日期 / Postgres 数组 / Iceberg 版本推断等），
 * 只需在 ENGINE_COMPAT_SELF_HEAL_SCENARIOS 里追加一项，无需改动匹配逻辑本身。
 */
import type { EngineCompatFlags } from '@/api/engineCompatApi';

export interface EngineCompatSelfHealScenario {
  id: string;
  /** 命中后需要置为 true 的 engine_compat 字段 */
  configKey: keyof EngineCompatFlags;
  /** 错误 message 需同时匹配以下所有正则才算命中 */
  matchers: RegExp[];
  titleKey: string;
  titleFallback: string;
  descriptionKey: string;
  descriptionFallback: string;
  actionKey: string;
  actionFallback: string;
}

export const ENGINE_COMPAT_SELF_HEAL_SCENARIOS: EngineCompatSelfHealScenario[] = [
  {
    id: 'sqlite_all_varchar',
    configKey: 'sqlite_all_varchar',
    matchers: [/Mismatch Type Error/i, /sqlite_all_varchar/i],
    titleKey: 'query.result.selfHeal.sqliteTypeMismatch.title',
    titleFallback: 'SQLite 类型不一致',
    descriptionKey: 'query.result.selfHeal.sqliteTypeMismatch.description',
    descriptionFallback: '该库存在声明类型与实际值不符的数据',
    actionKey: 'query.result.selfHeal.sqliteTypeMismatch.action',
    actionFallback: '开启 SQLite 兼容模式并重跑',
  },
];

export function matchEngineCompatSelfHeal(
  message: string | null | undefined
): EngineCompatSelfHealScenario | null {
  if (!message) return null;
  return (
    ENGINE_COMPAT_SELF_HEAL_SCENARIOS.find((scenario) =>
      scenario.matchers.every((re) => re.test(message))
    ) ?? null
  );
}
