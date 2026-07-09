import { useTranslation } from "react-i18next";
import { Upload } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DesktopLocalCardProps {
  /** Native file picker (Tauri `open` dialog); reuses handlePickFiles from UploadPanel */
  onPickFiles: () => void;
  /** True while a Tauri OS drag is hovering the window */
  dragOver: boolean;
  /** True while a picked/dropped path is being imported */
  importing: boolean;
}

/**
 * 桌面端（Tauri）「本地文件」分段：原生选择器 + 拖拽提示区。
 * 真正的拖拽文件接收由 UploadPanel 里的 Tauri `onDragDropEvent` 监听完成
 * （HTML5 dataTransfer 在桌面端拿不到真实路径），这里只负责按钮 + 视觉提示。
 */
export function DesktopLocalCard({
  onPickFiles,
  dragOver,
  importing,
}: DesktopLocalCardProps) {
  const { t } = useTranslation("common");

  return (
    <Card className="rounded-xl shadow-sm">
      <CardContent className="p-6 space-y-5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("page.datasource.desktopCardDesc")}
        </p>

        <Button variant="default" onClick={onPickFiles} disabled={importing}>
          {t("page.datasource.desktopPickFileBtn")}
        </Button>

        <div
          className={cn(
            "rounded-xl border border-dashed px-6 py-10 text-center transition-colors flex flex-col items-center justify-center gap-2",
            dragOver
              ? "border-primary bg-surface-hover"
              : "border-border bg-surface"
          )}
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-foreground font-medium text-sm">
            {t("page.datasource.desktopDragHint")}
          </p>
          <p className="font-ds-mono text-xs text-muted-foreground">
            {t("page.datasource.localTipsFormats")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
