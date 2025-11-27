import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getMySQLConfigs,
  deleteMySQLConfig,
  getPostgreSQLConfigs,
  deletePostgreSQLConfig
} from "../../services/apiClient";
import { Database, Trash2, Play, RefreshCw } from "lucide-react";

const SavedConnectionsList = ({ onSelect, onRefresh }) => {
  const { t } = useTranslation("common");
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadConfigs = async () => {
    setLoading(true);
    setError("");
    try {
      const [mysqlData, pgData] = await Promise.all([
        getMySQLConfigs().catch(err => {
          console.error("Failed to load MySQL configs:", err);
          return [];
        }),
        getPostgreSQLConfigs().catch(err => {
          console.error("Failed to load PostgreSQL configs:", err);
          return [];
        })
      ]);

      const allConfigs = [
        ...(Array.isArray(mysqlData) ? mysqlData : []).map(c => ({ ...c, type: "mysql" })),
        ...(Array.isArray(pgData) ? pgData : []).map(c => ({ ...c, type: "postgresql" }))
      ];

      setConfigs(allConfigs);
    } catch (err) {
      console.error("Error in loadConfigs:", err);
      setError(t("page.datasource.manage.fetchFail"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfigs();
  }, [onRefresh]);

  const handleDelete = async (id, type) => {
    if (!window.confirm(t("page.datasource.list.deleteConfirmDesc"))) return;

    try {
      if (type === "mysql") {
        await deleteMySQLConfig(id);
      } else if (type === "postgresql") {
        await deletePostgreSQLConfig(id);
      }
      loadConfigs();
    } catch (err) {
      alert(t("page.datasource.list.deleteFail", { message: err.message }));
    }
  };

  if (loading && configs.length === 0) {
    return <div className="text-sm text-muted-fg">{t("actions.loading")}</div>;
  }

  if (configs.length === 0) {
    return null;
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-6 space-y-4 shadow-sm mt-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          {t("page.datasource.list.title")}
        </h3>
        <button
          onClick={loadConfigs}
          className="p-1 hover:bg-surface-hover rounded-md text-muted-fg hover:text-foreground transition-colors"
          title={t("actions.refresh")}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {configs.map(config => (
          <div
            key={`${config.type}-${config.id}`}
            className="group border border-border rounded-lg p-4 hover:border-primary/50 hover:shadow-sm transition-all bg-surface"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${config.type === 'mysql' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                  }`}>
                  {config.type === 'mysql' ? 'MySQL' : 'PG'}
                </span>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleDelete(config.id, config.type)}
                  className="p-1.5 text-muted-fg hover:text-error hover:bg-error/10 rounded-md transition-colors"
                  title={t("actions.delete")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <h4 className="font-medium text-foreground truncate mb-1" title={config.name}>
              {config.name || config.id}
            </h4>

            <div className="text-xs text-muted-fg truncate mb-4">
              {config.params.host}:{config.params.port}/{config.params.database}
              {config.params.schema && config.params.schema !== 'public' && ` (${config.params.schema})`}
            </div>

            <button
              onClick={() => onSelect(config)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-md bg-surface-hover hover:bg-primary/10 text-sm font-medium text-foreground hover:text-primary transition-colors border border-border hover:border-primary/30"
            >
              <Play className="h-3.5 w-3.5" />
              {t("page.datasource.connection.connect")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SavedConnectionsList;
