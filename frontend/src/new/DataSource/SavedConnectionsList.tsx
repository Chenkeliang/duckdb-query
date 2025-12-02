import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getMySQLConfigs,
  deleteMySQLConfig,
  getPostgreSQLConfigs,
  deletePostgreSQLConfig
} from "../../services/apiClient";
import { Database, Trash2, Play, RefreshCw, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/new/components/ui/card";
import { Button } from "@/new/components/ui/button";
import { Badge } from "@/new/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/new/components/ui/dialog";

const SavedConnectionsList = ({ onSelect, onRefresh, showNotification }) => {
  const { t } = useTranslation("common");

  // Toast 通知函数
  const notify = (message, severity = "info") => {
    if (!message) return;
    showNotification?.(message, severity);
  };
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [configToDelete, setConfigToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
      const errorMsg = t("page.datasource.manage.fetchFail");
      setError(errorMsg);
      notify(errorMsg, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfigs();
  }, [onRefresh]);

  const handleDeleteClick = (config) => {
    setConfigToDelete(config);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!configToDelete) return;

    setIsDeleting(true);
    try {
      if (configToDelete.type === "mysql") {
        await deleteMySQLConfig(configToDelete.id);
      } else if (configToDelete.type === "postgresql") {
        await deletePostgreSQLConfig(configToDelete.id);
      }
      const successMsg = t("page.datasource.list.deleteSuccess", { name: configToDelete.name || configToDelete.id });
      notify(successMsg, "success");
      loadConfigs();
      setDeleteDialogOpen(false);
      setConfigToDelete(null);
    } catch (err) {
      const errorMsg = t("page.datasource.list.deleteFail", { message: err.message });
      notify(errorMsg, "error");
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading && configs.length === 0) {
    return <div className="text-sm text-muted-fg">{t("actions.loading")}</div>;
  }

  if (configs.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="shadow-sm mt-6">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              {t("page.datasource.list.title")}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadConfigs}
              title={t("actions.refresh")}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {configs.map(config => (
              <Card
                key={`${config.type}-${config.id}`}
                className="group hover:border-primary/50 hover:shadow-sm transition-all"
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <Badge variant={config.type === 'mysql' ? 'default' : 'outline'}>
                      {config.type === 'mysql' ? 'MySQL' : 'PG'}
                    </Badge>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(config)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-error"
                        title={t("actions.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <h4 className="font-medium text-foreground truncate mb-1" title={config.name}>
                    {config.name || config.id}
                  </h4>

                  <div className="text-xs text-muted-foreground truncate mb-4">
                    {config.params.host}:{config.params.port}/{config.params.database}
                    {config.params.schema && config.params.schema !== 'public' && ` (${config.params.schema})`}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSelect(config)}
                    className="w-full"
                  >
                    <Play className="h-3.5 w-3.5 mr-2" />
                    {t("page.datasource.connection.connect")}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("actions.delete")}</DialogTitle>
            <DialogDescription>
              {t("page.datasource.list.deleteConfirmDesc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              {t("actions.cancel")}
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  {t("actions.deleting", { defaultValue: t("actions.delete") })}
                </>
              ) : (
                t("actions.delete")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SavedConnectionsList;
