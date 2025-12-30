import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  deleteDatabaseConnection
} from '@/api';
import { useQueryClient } from "@tanstack/react-query";
import { Database, Trash2, Play, RefreshCw, Loader2 } from "lucide-react";
import { useDatabaseConnections, type DatabaseConnection } from "../hooks/useDatabaseConnections";
import { invalidateAfterDatabaseChange } from "../utils/cacheInvalidation";
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

interface SavedConnectionsListProps {
  onSelect: (config: DatabaseConnection) => void;
}

const SavedConnectionsList = ({ onSelect }: SavedConnectionsListProps) => {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const { connections: configs, isLoading: loading, refresh } = useDatabaseConnections();

  // const [configs, setConfigs] = useState([]); // Removed
  // const [loading, setLoading] = useState(false); // Removed
  // const [error, setError] = useState(""); // Error handled by hook theoretically, or ignored as per original code structure

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [configToDelete, setConfigToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // loadConfigs removed
  // useEffect removed

  const handleDeleteClick = (config: DatabaseConnection) => {
    setConfigToDelete(config);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!configToDelete) return;

    setIsDeleting(true);
    try {
      // 使用新的统一 API 删除数据库连接
      await deleteDatabaseConnection(configToDelete.id);

      // 立即失效缓存，触发列表更新
      await invalidateAfterDatabaseChange(queryClient);

      const successMsg = t("page.datasource.list.deleteSuccess", { name: configToDelete.name || configToDelete.id });
      toast.success(successMsg);
      // loadConfigs(); // Removed
      setDeleteDialogOpen(false);
      setConfigToDelete(null);
    } catch (err: any) {
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
      <Card className="shadow-sm">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              {t("page.datasource.list.title")}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refresh()}
              title={t("actions.refresh")}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {configs.map(config => (
              <Card
                key={`${config.type}-${config.id}`}
                className="group hover:border-primary/50 hover:shadow-sm transition-all"
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <Badge
                      variant="default"
                      className={
                        config.type === 'mysql'
                          ? 'bg-orange-500 hover:bg-orange-600'
                          : config.type === 'postgresql'
                            ? 'bg-blue-500 hover:bg-blue-600'
                            : 'bg-emerald-500 hover:bg-emerald-600'
                      }
                    >
                      {config.type === 'mysql' ? 'MySQL' : config.type === 'postgresql' ? 'PostgreSQL' : 'SQLite'}
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
                    {config.params?.host}:{config.params?.port}/{config.params?.database}
                    {config.params?.schema && config.params?.schema !== 'public' && ` (${config.params?.schema})`}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSelect(config)}
                    className="w-full truncate"
                  >
                    <Play className="h-3.5 w-3.5 mr-2" />
                    {t("page.datasource.list.connect")}
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
