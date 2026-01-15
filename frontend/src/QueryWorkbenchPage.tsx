import * as React from "react";

import { QueryWorkspace } from "./Query/QueryWorkspace";
import { PivotWorkbench } from "./Query/PivotWorkbench";
import { AsyncTaskPanel } from "./Query/AsyncTasks";
import { useAsyncTaskMonitor } from "./hooks/useAsyncTaskMonitor";

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
  /** 预览 SQL（来自异步任务等） */
  previewSQL?: string;
  /** 从任务列表预览某个结果 */
  onPreviewSQL?: (sql: string) => void;
}

export const QueryWorkbenchPage: React.FC<QueryWorkbenchPageProps> = ({
  activeTab = "query",
  onTabChange,
  previewSQL,
  onPreviewSQL,
}) => {


  // 启动异步任务监控
  useAsyncTaskMonitor();

  return (
    <div className="h-full w-full">
      {activeTab === "query" ? (
        <QueryWorkspace previewSQL={previewSQL} />
      ) : activeTab === "pivot" ? (
        <PivotWorkbench />
      ) : (
        <AsyncTaskPanel
          className="h-full"
          onPreviewSQL={(sql) => {
            onPreviewSQL?.(sql);
            onTabChange?.("query");
          }}
        />
      )}
    </div>
  );
};

export default QueryWorkbenchPage;
