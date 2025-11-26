import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * New database form using tokens + tailwind styles.
 * Emits normalized params for test/save, without touching legacy components.
 */
const DatabaseForm = ({
  defaultType = "mysql",
  onTest,
  onSave,
  loading = false,
  testing = false
}) => {
  const { t } = useTranslation("common");
  const [type, setType] = useState(defaultType);
  const [name, setName] = useState("");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("3306");
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [sqlitePath, setSqlitePath] = useState("");
  const [error, setError] = useState("");

  const isSqlite = type === "sqlite";

  const normalizedParams = useMemo(() => {
    const params =
      type === "sqlite"
        ? { path: sqlitePath }
        : {
          host: host.trim(),
          port: Number(port) || null,
          user: username.trim(),
          password: password,
          database: database.trim()
        };

    return {
      type,
      id:
        name.trim() ||
        `${type}-${host || "localhost"}${port ? `:${port}` : ""}`,
      params
    };
  }, [type, name, host, port, username, password, database, sqlitePath]);

  const validate = () => {
    if (!normalizedParams.id) {
      setError(t("page.datasource.connection.errorName"));
      return false;
    }
    if (!isSqlite) {
      if (!host.trim() || !database.trim()) {
        setError(t("page.datasource.connection.errorSave", { message: "" }));
        return false;
      }
    } else if (!sqlitePath.trim()) {
      setError(t("page.datasource.connection.errorSave", { message: "" }));
      return false;
    }
    setError("");
    return true;
  };

  const handleTest = () => {
    if (!validate()) return;
    onTest?.(normalizedParams);
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave?.(normalizedParams);
  };

  const inputBase =
    "h-10 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary";

  const labelBase = "text-xs text-muted-foreground";

  const dbTabs = [
    { id: "mysql", label: t("page.datasource.connection.dbTypes.mysql") },
    {
      id: "postgresql",
      label: t("page.datasource.connection.dbTypes.postgresql")
    },
    { id: "sqlite", label: t("page.datasource.connection.dbTypes.sqlite") }
  ];

  return (
    <div className="bg-surface border border-border rounded-xl p-6 space-y-4 shadow-sm">
      {/* 顶部数据库类型切换 Tabs */}
      <div className="border-b border-border flex gap-6 text-sm font-medium">
        {dbTabs.map(tab => {
          const active = tab.id === type;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setType(tab.id)}
              className={`pb-2 flex items-center gap-2 border-b-2 transition-colors ${active
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
            >
              {active && <span className="w-2 h-2 rounded-full bg-green-400"></span>}
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
        <div className="space-y-2 md:col-span-2">
          <label className={labelBase}>
            {t("page.datasource.connection.name")}
          </label>
          <input
            className={inputBase}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t("page.datasource.connection.namePlaceholder")}
          />
        </div>

        {!isSqlite ? (
          <>
            <div className="space-y-2">
              <label className={labelBase}>
                {t("page.datasource.connection.host")}
              </label>
              <input
                className={inputBase}
                value={host}
                onChange={e => setHost(e.target.value)}
                placeholder="localhost"
              />
            </div>
            <div className="space-y-2">
              <label className={labelBase}>
                {t("page.datasource.connection.port")}
              </label>
              <input
                className={inputBase}
                value={port}
                onChange={e => setPort(e.target.value)}
                placeholder="3306"
              />
            </div>
            <div className="space-y-2">
              <label className={labelBase}>
                {t("page.datasource.connection.username")}
              </label>
              <input
                className={inputBase}
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="root"
              />
            </div>
            <div className="space-y-2">
              <label className={labelBase}>
                {t("page.datasource.connection.password")}
              </label>
              <input
                type="password"
                className={inputBase}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className={labelBase}>
                {t("page.datasource.connection.database")}
              </label>
              <input
                className={inputBase}
                value={database}
                onChange={e => setDatabase(e.target.value)}
                placeholder={t(
                  "page.datasource.connection.databasePlaceholder"
                )}
              />
            </div>
          </>
        ) : (
          <div className="space-y-2 md:col-span-2">
            <label className={labelBase}>
              {t("page.datasource.connection.sqlitePath")}
            </label>
            <input
              className={inputBase}
              value={sqlitePath}
              onChange={e => setSqlitePath(e.target.value)}
              placeholder={t("page.datasource.connection.sqlitePlaceholder")}
            />
          </div>
        )}
      </div>

      {error ? (
        <div className="text-xs text-red-500">{error}</div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || loading}
          className="px-4 py-2 rounded-md border border-border bg-surface text-sm font-medium text-foreground hover:bg-surface-hover disabled:opacity-60"
        >
          {testing
            ? t("page.datasource.connection.testing")
            : t("page.datasource.connection.test")}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          {loading
            ? t("page.datasource.connection.saving")
            : t("page.datasource.connection.save")}
        </button>
      </div>
    </div>
  );
};

export default DatabaseForm;
