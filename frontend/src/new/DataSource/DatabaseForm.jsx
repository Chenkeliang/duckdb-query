import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getServerMounts, browseServerDirectory } from "../../services/apiClient";
import { Server } from "lucide-react";
import { Card, CardContent } from "@/new/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/new/components/ui/tabs";
import { Button } from "@/new/components/ui/button";
import { Input } from "@/new/components/ui/input";
import { Label } from "@/new/components/ui/label";

/**
 * New database form using shadcn/ui components.
 * Emits normalized params for test/save, without touching legacy components.
 * 
 * Now using:
 * - Card for container
 * - Tabs for database type switching
 * - Button for all actions
 * - Input for form fields
 * - Label for field labels
 */
const DatabaseForm = ({
  defaultType = "mysql",
  configToLoad,
  onTest,
  onSave,
  onSaveConfig,
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
  const [schema, setSchema] = useState("public"); // PostgreSQL schema

  // Load config when configToLoad changes
  useEffect(() => {
    if (configToLoad) {
      setType(configToLoad.type || "mysql");
      setName(configToLoad.name || configToLoad.id || "");
      if (configToLoad.params) {
        setHost(configToLoad.params.host || "localhost");
        setPort(configToLoad.params.port?.toString() || (configToLoad.type === "postgresql" ? "5432" : "3306"));
        setDatabase(configToLoad.params.database || "");
        setUsername(configToLoad.params.user || "");
        setPassword(configToLoad.params.password || "");
        setSchema(configToLoad.params.schema || "public");
        setSqlitePath(configToLoad.params.path || "");
      }
    }
  }, [configToLoad]);

  // SQLite server browsing states
  const [serverMounts, setServerMounts] = useState([]);
  const [selectedMount, setSelectedMount] = useState("");
  const [serverEntries, setServerEntries] = useState([]);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState("");

  const [error, setError] = useState("");

  const isSqlite = type === "sqlite";
  const isPostgreSQL = type === "postgresql";

  const normalizedParams = useMemo(() => {
    const params =
      type === "sqlite"
        ? { path: sqlitePath }
        : {
          host: host.trim(),
          port: Number(port) || null,
          user: username.trim(),
          password: password,
          database: database.trim(),
          ...(isPostgreSQL && { schema: schema.trim() || "public" })
        };

    return {
      type,
      id:
        name.trim() ||
        `${type}-${host || "localhost"}${port ? `:${port}` : ""}`,
      params
    };
  }, [type, name, host, port, username, password, database, sqlitePath, schema, isPostgreSQL]);

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

  const handleConnect = () => {
    if (!validate()) return;
    onSave?.(normalizedParams);
  };

  const handleSaveConfigClick = () => {
    if (!validate()) return;
    onSaveConfig?.(normalizedParams);
  };

  // Load server mounts when SQLite tab is active
  useEffect(() => {
    if (isSqlite && serverMounts.length === 0) {
      loadServerMounts();
    }
  }, [isSqlite]);

  const loadServerMounts = async () => {
    setServerLoading(true);
    setServerError("");
    try {
      const data = await getServerMounts();
      const mounts = data?.mounts || [];
      setServerMounts(mounts);
      if (mounts.length > 0) {
        const first = mounts[0];
        setSelectedMount(first.path);
        await loadServerDirectory(first.path);
      }
    } catch (err) {
      setServerError(err?.message || t("page.datasource.serverBrowseFail"));
    } finally {
      setServerLoading(false);
    }
  };

  const loadServerDirectory = async (path) => {
    if (!path) return;
    setServerLoading(true);
    setServerError("");
    try {
      const data = await browseServerDirectory(path);
      // Filter for .db, .sqlite, .sqlite3 files
      const entries = (data?.entries || []).filter(entry => {
        if (entry.type === "directory") return true;
        const ext = entry.extension?.toLowerCase();
        return ext === "db" || ext === "sqlite" || ext === "sqlite3";
      });
      setServerEntries(entries);
    } catch (err) {
      setServerError(err?.message || t("page.datasource.serverBrowseFail"));
    } finally {
      setServerLoading(false);
    }
  };

  const dbTabs = [
    { id: "mysql", label: t("page.datasource.connection.dbTypes.mysql") },
    {
      id: "postgresql",
      label: t("page.datasource.connection.dbTypes.postgresql")
    },
    { id: "sqlite", label: t("page.datasource.connection.dbTypes.sqlite") }
  ];

  return (
    <Card className="shadow-sm">
      <CardContent className="p-8 space-y-6">
        {/* 顶部数据库类型切换 Tabs */}
        <Tabs value={type} onValueChange={setType}>
          <TabsList className="grid w-full grid-cols-3">
            {dbTabs.map(tab => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-6">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="connection-name">
              {t("page.datasource.connection.name")}
            </Label>
            <Input
              id="connection-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t("page.datasource.connection.namePlaceholder")}
            />
          </div>

        {!isSqlite ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="host">
                {t("page.datasource.connection.host")}
              </Label>
              <Input
                id="host"
                value={host}
                onChange={e => setHost(e.target.value)}
                placeholder="localhost"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="port">
                {t("page.datasource.connection.port")}
              </Label>
              <Input
                id="port"
                value={port}
                onChange={e => setPort(e.target.value)}
                placeholder="3306"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">
                {t("page.datasource.connection.username")}
              </Label>
              <Input
                id="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="root"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">
                {t("page.datasource.connection.password")}
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="database">
                {t("page.datasource.connection.database")}
              </Label>
              <Input
                id="database"
                value={database}
                onChange={e => setDatabase(e.target.value)}
                placeholder={t(
                  "page.datasource.connection.databasePlaceholder"
                )}
              />
            </div>
            {isPostgreSQL && (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="schema">
                  {t("page.datasource.connection.schema")}
                </Label>
                <Input
                  id="schema"
                  value={schema}
                  onChange={e => setSchema(e.target.value)}
                  placeholder="public"
                />
                <p className="text-[11px] text-muted-foreground">
                  {t("page.datasource.connection.schemaHelper")}
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="sqlite-path">
                {t("page.datasource.connection.sqlitePath")}
              </Label>
              <Input
                id="sqlite-path"
                value={sqlitePath}
                onChange={e => setSqlitePath(e.target.value)}
                placeholder={t("page.datasource.connection.sqlitePlaceholder")}
              />
            </div>

            {/* SQLite Server Browser */}
            <div className="space-y-2 md:col-span-2 border border-border rounded-lg p-4 bg-surface-hover/30">
              <label className="text-xs font-medium text-foreground flex items-center gap-2">
                <Server className="h-4 w-4 text-muted-fg" />
                {t("page.datasource.cardServerTitle")}
              </label>

              {serverMountLoading ? (
                <div className="text-xs text-muted-fg">{t("actions.loading")}</div>
              ) : serverMounts.length === 0 ? (
                <div className="text-xs text-muted-fg">
                  {t("page.datasource.serverNoMount")}
                </div>
              ) : (
                <div className="space-y-3">
                  <select
                    className="h-9 w-full rounded-md border border-border bg-input px-2 text-sm text-foreground"
                    value={selectedMount}
                    onChange={e => {
                      const path = e.target.value;
                      setSelectedMount(path);
                      loadServerDirectory(path);
                    }}
                  >
                    {serverMounts.map(m => (
                      <option key={m.path} value={m.path}>
                        {m.label || m.path}
                      </option>
                    ))}
                  </select>

                  <div className="rounded-lg border border-border bg-surface max-h-48 overflow-auto space-y-1 p-1">
                    {serverLoading ? (
                      <div className="px-3 py-2 text-xs text-muted-fg">
                        {t("actions.loading")}
                      </div>
                    ) : serverEntries.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-fg">
                        {t("page.datasource.serverNoFiles")}
                      </div>
                    ) : (
                      serverEntries.map(entry => {
                        const isDir = entry.type === "directory";
                        const isSelected = sqlitePath === entry.path;
                        return (
                          <button
                            key={entry.path}
                            type="button"
                            onClick={() =>
                              isDir
                                ? loadServerDirectory(entry.path)
                                : setSqlitePath(entry.path)
                            }
                            className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm transition-colors ${isSelected
                              ? "bg-primary/10 text-primary"
                              : "hover:bg-surface-hover text-foreground"
                              }`}
                          >
                            <span className="flex items-center gap-2 truncate">
                              {isDir ? (
                                <span className="text-muted-fg">📁</span>
                              ) : (
                                <span className="text-muted-fg">📄</span>
                              )}
                              {entry.name}
                            </span>
                            {!isDir && (
                              <span className="text-[10px] text-muted-fg ml-2">
                                {(entry.extension || "").toUpperCase()}
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                  {serverError && (
                    <div className="text-xs text-error">{serverError}</div>
                  )}
                </div>
              )}
            </div>


          </>
        )}
      </div>

        {error ? <div className="text-xs text-error">{error}</div> : null}

        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={testing || loading}
          >
            {testing
              ? t("page.datasource.connection.testing")
              : t("page.datasource.connection.test")}
          </Button>
          <Button
            onClick={handleConnect}
            disabled={loading}
          >
            {loading
              ? t("page.datasource.connection.connecting", {
                defaultValue: t("page.datasource.connection.saving")
              })
              : t("page.datasource.connection.connect", {
                defaultValue: t("page.datasource.connection.save")
              })}
          </Button>
          {onSaveConfig ? (
            <Button
              variant="outline"
              onClick={handleSaveConfigClick}
              disabled={loading}
            >
              {t("page.datasource.connection.save")}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

export default DatabaseForm;
