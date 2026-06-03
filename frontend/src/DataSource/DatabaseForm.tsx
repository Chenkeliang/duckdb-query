import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getServerMounts, browseServerDirectory } from '@/api';
import { Server, Loader2, Sparkles } from "lucide-react";
import { parseConnectionString } from "./parseConnectionString";
import type { DatabaseConnectParams } from "../hooks/useAppActions";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** A saved connection loaded into the form for editing. */
interface ConfigToLoad {
  id?: string;
  type?: string;
  name?: string;
  requiresPassword?: boolean;
  params?: {
    host?: string;
    port?: number | string;
    database?: string;
    user?: string;
    username?: string;
    password?: string;
    schema?: string;
    path?: string;
  };
}

/** A mount point / file entry from the server-side SQLite browser. */
interface ServerMount {
  path: string;
  label?: string;
}
interface ServerEntry {
  name: string;
  path: string;
  type?: string;
  extension?: string;
}

interface DatabaseFormProps {
  defaultType?: string;
  configToLoad?: ConfigToLoad | null;
  onTest?: (params: DatabaseConnectParams) => void;
  onSave?: (params: DatabaseConnectParams) => void;
  onSaveConfig?: (params: DatabaseConnectParams) => void;
  loading?: boolean;
  testing?: boolean;
}

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
  testing = false,
}: DatabaseFormProps) => {
  const { t } = useTranslation("common");
  const [connectionId, setConnectionId] = useState<string>("");
  const [type, setType] = useState(defaultType);
  const [name, setName] = useState("");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("3306");
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [hasStoredPassword, setHasStoredPassword] = useState(false);
  const [sqlitePath, setSqlitePath] = useState("");
  const [schema, setSchema] = useState("public"); // PostgreSQL schema

  // Paste-a-connection-string -> auto-fill the fields.
  const [connStr, setConnStr] = useState("");
  const [parsedHint, setParsedHint] = useState("");
  const applyConnectionString = (raw: string) => {
    setConnStr(raw);
    const p = parseConnectionString(raw);
    if (!p) {
      setParsedHint("");
      return;
    }
    setType(p.type);
    if (p.type === "sqlite") {
      if (p.database) setSqlitePath(p.database);
      setParsedHint(
        t("page.datasource.connection.parsedSqlite", { defaultValue: "已识别为 SQLite 文件路径" })
      );
      return;
    }
    if (p.host) setHost(p.host);
    if (p.port) setPort(String(p.port));
    if (p.database) setDatabase(p.database);
    if (p.username) setUsername(p.username);
    if (p.password) setPassword(p.password);
    if (p.schema) setSchema(p.schema);
    setParsedHint(
      t("page.datasource.connection.parsedOk", {
        type: p.type === "postgresql" ? "PostgreSQL" : "MySQL",
        host: p.host ?? "",
        defaultValue: `已识别为 ${p.type === "postgresql" ? "PostgreSQL" : "MySQL"} · ${p.host ?? ""}`,
      })
    );
  };

  // Load config when configToLoad changes
  useEffect(() => {
    if (configToLoad) {
      const loadedId = configToLoad.id || "";
      setConnectionId(loadedId);
      setType(configToLoad.type || "mysql");
      setName(configToLoad.name || configToLoad.id || "");
      if (configToLoad.params) {
        setHost(configToLoad.params.host || "localhost");
        setPort(configToLoad.params.port?.toString() || (configToLoad.type === "postgresql" ? "5432" : "3306"));
        setDatabase(configToLoad.params.database || "");
        setUsername(configToLoad.params.user || configToLoad.params.username || "");
        const stored = configToLoad.requiresPassword === true || configToLoad.params.password === "***ENCRYPTED***";
        setHasStoredPassword(stored);
        setPassword(stored ? "" : (configToLoad.params.password || ""));
        setSchema(configToLoad.params.schema || "public");
        setSqlitePath(configToLoad.params.path || "");
      }
    } else {
      setConnectionId("");
      setHasStoredPassword(false);
    }
  }, [configToLoad]);

  // SQLite server browsing states
  const [serverMounts, setServerMounts] = useState<ServerMount[]>([]);
  const [serverMountLoading, setServerMountLoading] = useState(false);
  const [selectedMount, setSelectedMount] = useState("");
  const [serverEntries, setServerEntries] = useState<ServerEntry[]>([]);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState("");

  const [error, setError] = useState("");

  const isSqlite = type === "sqlite";
  const isPostgreSQL = type === "postgresql";

  const normalizedParams = useMemo(() => {
    const resolvedId =
      connectionId ||
      name.trim() ||
      `${type}-${host || "localhost"}${port ? `:${port}` : ""}`;

    const params =
      type === "sqlite"
        ? { path: sqlitePath }
        : {
          host: host.trim(),
          port: Number(port) || undefined,
          user: username.trim(),
          ...(password ? { password } : {}),
          database: database.trim(),
          ...(isPostgreSQL && { schema: schema.trim() || "public" })
        };

    return {
      type: type as DatabaseConnectParams["type"],
      id: resolvedId,
      name: name.trim() || resolvedId,
      isSavedConnection: !!connectionId,
      hasStoredPassword,
      useStoredPassword: !!connectionId && hasStoredPassword && !password,
      params
    };
  }, [type, connectionId, name, host, port, username, password, database, sqlitePath, schema, isPostgreSQL, hasStoredPassword]);

  const validate = () => {
    // 检查连接名称
    if (!name.trim()) {
      const errorMsg = t("page.datasource.connection.validation.requiredName", "请填写连接名称");
      setError(errorMsg);
      return false;
    }

    if (!isSqlite) {
      // 检查主机地址
      if (!host.trim()) {
        const errorMsg = t("page.datasource.connection.validation.requiredHost", "请填写主机地址");
        setError(errorMsg);        return false;
      }

      // 检查端口
      if (!port.trim()) {
        const errorMsg = t("page.datasource.connection.validation.requiredPort", "请填写端口号");
        setError(errorMsg);        return false;
      }

      // 检查用户名
      if (!username.trim()) {
        const errorMsg = t("page.datasource.connection.validation.requiredUser", "请填写用户名");
        setError(errorMsg);        return false;
      }

      // 检查数据库名
      if (!database.trim()) {
        const errorMsg = t("page.datasource.connection.validation.requiredDatabase", "请填写数据库名称");
        setError(errorMsg);        return false;
      }

      // 验证端口号是否为有效数字
      const portNum = Number(port);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        const errorMsg = t("page.datasource.connection.validation.invalidPort", "端口号必须在 1-65535 之间");
        setError(errorMsg);        return false;
      }
    } else {
      // SQLite 检查路径
      if (!sqlitePath.trim()) {
        const errorMsg = t("page.datasource.connection.validation.requiredPath", "请填写 SQLite 数据库文件路径");
        setError(errorMsg);        return false;
      }
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
    setServerMountLoading(true);
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
      // 静默处理错误 - 如果服务器没有配置挂载点，不显示错误
      console.debug("Server mounts not configured:", err instanceof Error ? err.message : err);
      setServerMounts([]); // 确保设置为空数组
    } finally {
      setServerMountLoading(false);
    }
  };

  const loadServerDirectory = async (path: string) => {
    if (!path) return;
    setServerLoading(true);
    setServerError("");
    try {
      const data = await browseServerDirectory(path);
      // Filter for .db, .sqlite, .sqlite3 files
      const entries = (data?.items || []).filter((entry: { type?: string; extension?: string }) => {
        if (entry.type === "directory") return true;
        const ext = entry.extension?.toLowerCase();
        return ext === "db" || ext === "sqlite" || ext === "sqlite3";
      });
      setServerEntries(entries);
    } catch (err) {
      setServerError(
        (err instanceof Error ? err.message : "") || t("page.datasource.serverBrowseFail")
      );
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
        {/* 粘贴连接串，自动识别并回填字段 */}
        <div className="space-y-2 rounded-lg border border-border bg-surface-elevated/40 p-3">
          <Label
            htmlFor="conn-str"
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {t("page.datasource.connection.pasteLabel", {
              defaultValue: "粘贴连接串，自动识别（JDBC / URI）",
            })}
          </Label>
          <Input
            id="conn-str"
            value={connStr}
            onChange={(e) => applyConnectionString(e.target.value)}
            placeholder="jdbc:mysql://host:3306/db  ·  postgresql://user:pass@host/db"
            className="font-mono text-xs"
          />
          {parsedHint && <p className="text-xs text-success">{parsedHint}</p>}
        </div>
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

        <form onSubmit={(e) => { e.preventDefault(); handleTest(); }}>
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
                    autoComplete="username"
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
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={hasStoredPassword ? t("page.datasource.connection.hint.passwordSavedPlaceholder", "••••••（已保存，留空使用已保存密码）") : "••••••"}
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
                    <p className="text-xs text-muted-foreground">
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

                {/* SQLite Server Browser - 只在有挂载点或正在加载时显示 */}
                {(serverMountLoading || serverMounts.length > 0) && (
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
                                    <span className="text-xs text-muted-fg ml-2">
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
                )}


              </>
            )}
          </div>

          {error ? <div className="text-xs text-error">{error}</div> : null}

          <div className="flex flex-wrap gap-3 pt-4">
            <Button
              type="submit"
              variant="outline"
              disabled={testing || loading}
            >
              {testing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  {t("page.datasource.connection.testing")}
                </>
              ) : (
                t("page.datasource.connection.test")
              )}
            </Button>
            <Button
              type="button"
              onClick={handleConnect}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  {t("page.datasource.connection.connecting", {
                    defaultValue: t("page.datasource.connection.saving")
                  })}
                </>
              ) : (
                t("page.datasource.connection.connect", {
                  defaultValue: t("page.datasource.connection.save")
                })
              )}
            </Button>
            {onSaveConfig ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={handleSaveConfigClick}
                disabled={loading}
                title={t("page.datasource.connection.saveOnlyHint", {
                  defaultValue: "仅保存配置，不测试连接",
                })}
              >
                {t("page.datasource.connection.saveOnly", { defaultValue: "仅保存不测试" })}
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default DatabaseForm;
