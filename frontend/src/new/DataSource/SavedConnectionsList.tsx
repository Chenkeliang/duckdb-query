import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  listDatabaseConnections,
  deleteDatabaseConnection
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

const SavedConnectionsList = ({ onSelect, onRefresh }) => {
  const { t } = useTranslation("common");
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
      // 使用新的统一 API 获取所有数据库连接
      const response = await listDatabaseConnections();
      
      // 处理新的响应格式
      let allConfigs = [];
      if (response && response.success && response.data && Array.isArray(response.data.items)) {
        // 新格式：{ success: true, data: { items: [...] } }
        allConfigs = response.data.items.map(item => {
          const host = item.metadata?.host || item.connection_info?.host;
          const port = item.metadata?.port || item.connection_info?.port;
          const database = item.metadata?.database || item.connection_info?.database;
          const user = item.connection_info?.user;
          const schema = item.metadata?.schema;
          
          return {
            id: item.id.replace('db_', ''), // 移除 db_ 前缀
            name: item.name,
            type: item.subtype, // mysql, postgresql, sqlite
            host,
            port,
            database,
            user,
            schema,
            status: item.status,
            created_at: item.created_at,
            updated_at: item.updated_at,
            // 添加 params 字段以兼容 DatabaseForm 的期望格式
            params: {
              host,
              port,
              database,
              user,
              schema,
              password: '***ENCRYPTED***', // 密码标记，表示已有密码
              path: item.metadata?.path || '' // SQLite 路径
            }
          };
        });
      } else if (Array.isArray(response)) {
        // 旧格式：直接是数组
        allConfigs = response;
      }

      setConfigs(allConfigs);
    } catch (err) {
      console.error("Error in loadConfigs:", err);
      const errorMsg = t("page.datasource.manage.fetchFail");
      setError(errorMsg);
      toast.error(errorMsg);
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
      // 使用新的统一 API 删除数据库连接
      await deleteDatabaseConnection(configToDelete.id);
      
      const successMsg = t("page.datasource.list.deleteSuccess", { name: configToDelete.name || configToDelete.id });
      toast.success(successMsg);
      loadConfigs();
      setDeleteDialogOpen(false);
      setConfigToDelete(null);
    } catch (err) {
      const errorMsg = t("page.datasource.list.deleteFail", { message: err.message });
      toast.error(errorMsg);
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
                    {config.host}:{config.port}/{config.database}
                    {config.schema && config.schema !== 'public' && ` (${config.schema})`}
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
