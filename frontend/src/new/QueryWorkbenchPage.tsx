import * as React from "react";
import { useTranslation } from "react-i18next";
import { Search, Clock } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/new/components/ui/tabs";
import { QueryWorkspace } from "./Query/QueryWorkspace";

/**
 * 查询工作台页面
 * 
 * 这是查询工作台的入口页面，包含：
 * - 二级 TAB：查询模式 / 异步任务
 * - 查询工作台（三栏布局 + 三级 TAB）
 */

interface QueryWorkbenchPageProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export const QueryWorkbenchPage: React.FC<QueryWorkbenchPageProps> = ({
  activeTab = "query",
  onTabChange,
}) => {
  const { t } = useTranslation("common");

  return (
    <div className="h-full w-full">
      {activeTab === "query" ? (
        <QueryWorkspace />
      ) : (
        <div className="p-6">
          <div className="text-sm text-muted-foreground">
            {t("workspace.asyncTasksPending")}
          </div>
        </div>
      )}
    </div>
  );
};

export default QueryWorkbenchPage;
