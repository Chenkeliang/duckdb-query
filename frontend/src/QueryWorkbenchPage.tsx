import * as React from "react";
import { useTranslation } from "react-i18next";

import { Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IS_DEMO } from "@/demo/isDemo";
import type { TableSource } from '@/types/queryWorkspace';
import type { QueryResponse } from '@/api';
import type { DataSourceMethod } from '@/DataSource/DataSourceActions';
import type { DatabaseConnection } from '@/hooks/useDatabaseConnections';
import { QueryWorkspace } from "./Query/QueryWorkspace";
import { AsyncTaskPanel } from "./Query/AsyncTasks";
import { Sheet, SheetContent, SheetTitle } from "./components/ui/sheet";

/**
 * 查询工作台页面
 *
 * 工作区始终挂载；异步任务以右侧面板（Sheet）叠加打开，
 * 不再像二级 TAB 那样卸载工作区、丢失编辑器与结果状态。
 */

interface QueryWorkbenchPageProps {
  isActive?: boolean;
  onAddData?: (method: DataSourceMethod) => void;
  onEditConnection?: (connection: DatabaseConnection) => void;
  /** 预览 SQL（来自异步任务等） */
  previewSQL?: string;
  previewNonce?: number;
  /** 从任务列表预览某个结果 */
  asyncRunning?: number;
  asyncTotal?: number;
  onOpenAiSettings?: () => void;
  asyncTasksOpen?: boolean;
  onAsyncTasksOpenChange?: (open: boolean) => void;
}

export const QueryWorkbenchPage: React.FC<QueryWorkbenchPageProps> = ({
  isActive = true,
  onAddData,
  onEditConnection,
  previewSQL,
  previewNonce,
  asyncRunning = 0,
  asyncTotal = 0,
  onOpenAiSettings,
  asyncTasksOpen = false,
  onAsyncTasksOpenChange,
}) => {
  const { t } = useTranslation("common");
  const [taskContainer, setTaskContainer] = React.useState<HTMLDivElement | null>(null);
  const dismissedOutside = React.useRef(false);
  const taskTriggerRef = React.useRef<HTMLButtonElement>(null);
  const [backgroundResult, setBackgroundResult] = React.useState<{ response: QueryResponse; sql: string; source: TableSource }>();

  return (
    <div ref={setTaskContainer} className="relative h-full w-full">
      <QueryWorkspace taskActions={!IS_DEMO && <Button
        ref={taskTriggerRef} variant={asyncTasksOpen ? 'secondary' : 'ghost'} size="sm"
        className="h-7 shrink-0 gap-1.5" aria-expanded={asyncTasksOpen} aria-controls="workbench-task-panel"
        onClick={() => onAsyncTasksOpenChange?.(!asyncTasksOpen)}
        title={t('async.runningSummary', { count: asyncRunning })}
      >
        {asyncRunning > 0 ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> : <Clock className="size-3.5" />}
        {t('async.tasksEntry')}
        <span className="min-w-4 rounded bg-surface-active px-1 text-xs tabular-nums">{asyncRunning || asyncTotal}</span>
      </Button>} backgroundResult={backgroundResult} onAddData={onAddData} onEditConnection={onEditConnection} isActive={isActive} previewSQL={previewSQL} previewNonce={previewNonce} onOpenAiSettings={onOpenAiSettings} />
      <Sheet modal={false} open={asyncTasksOpen} onOpenChange={onAsyncTasksOpenChange}>
        <SheetContent
          side="right"
          showCloseButton={false}
          id="workbench-task-panel"
          portalContainer={taskContainer}
          className="absolute top-10 bottom-0 flex h-auto w-full flex-col gap-0 p-0 sm:max-w-lg"
          onCloseAutoFocus={(event) => {
            if (!dismissedOutside.current) {
              event.preventDefault();
              taskTriggerRef.current?.focus();
            }
            dismissedOutside.current = false;
          }}
          onInteractOutside={(event) => {
            if (taskTriggerRef.current?.contains(event.target as Node)) event.preventDefault();
            else dismissedOutside.current = true;
          }}
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">{t("async.panelTitle")}</SheetTitle>
          <AsyncTaskPanel
            active={asyncTasksOpen}
            className="h-full"
            onClose={() => onAsyncTasksOpenChange?.(false)}
            onPreviewResult={(response, sql, source) => {
              setBackgroundResult({ response, sql, source });
              onAsyncTasksOpenChange?.(false);
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default QueryWorkbenchPage;
