/**
 * 与后端 `api/core/common/config_manager.py` 中 `AppConfig.max_query_rows` 默认值保持一致。
 * 应用配置加载成功后，以 `/api/app-config/features`（useAppConfig）返回的 `max_query_rows` 为准。
 */
export const DEFAULT_MAX_QUERY_ROWS = 10_000;
