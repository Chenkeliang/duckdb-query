import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Upload } from "lucide-react";
import { CHUNKED_UPLOAD_THRESHOLD_BYTES } from "@/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface LocalUploadCardProps {
  maxFileSizeDisplay: string;
  selectedFile: File | null;
  uploadAlias: string;
  uploading: boolean;
  uploadProgress: number | null;
  dragOver: boolean;
  onFileSelect: (file: File) => void;
  onUploadAliasChange: (value: string) => void;
  onDragOver: (over: boolean) => void;
  onUpload: () => void;
  onClear: () => void;
}

export function LocalUploadCard({
  maxFileSizeDisplay,
  selectedFile,
  uploadAlias,
  uploading,
  uploadProgress,
  dragOver,
  onFileSelect,
  onUploadAliasChange,
  onDragOver,
  onUpload,
  onClear,
}: LocalUploadCardProps) {
  const { t } = useTranslation("common");
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <Card className="shadow-sm">
      <CardContent className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-fg">
              {t("page.datasource.tabLocal")}
            </p>
            <h3 className="text-lg font-semibold text-foreground">
              {t("page.datasource.cardLocalTitle")}
            </h3>
          </div>
          <span className="text-xs text-muted-fg">
            {t("page.datasource.localTipsFormats")}
          </span>
        </div>

        <div
          onDragOver={e => {
            e.preventDefault();
            onDragOver(true);
          }}
          onDragLeave={() => onDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            onDragOver(false);
            const file = e.dataTransfer?.files?.[0];
            if (file) onFileSelect(file);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-xl border border-dashed px-6 py-10 text-center transition-colors flex flex-col items-center justify-center gap-2 ${
            dragOver
              ? "border-primary bg-surface-hover"
              : "border-border bg-surface hover:border-primary"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) onFileSelect(file);
            }}
            accept=".csv,.xlsx,.xls,.json,.jsonl,.parquet,.pq"
          />
          <Upload className="h-8 w-8 text-muted-fg" />
          <p className="text-foreground font-medium text-sm">
            {t("page.datasource.dragHere")}
          </p>
          <p className="text-xs text-muted-fg">
            {t("page.datasource.maxSizeTemplate", { size: maxFileSizeDisplay })}
          </p>
          <p className="text-xs text-muted-fg">
            {t("page.datasource.chunkedHint", {
              mb: Math.round(CHUNKED_UPLOAD_THRESHOLD_BYTES / 1024 / 1024),
              defaultValue: `大于 {{mb}}MB 将自动分块上传`,
            })}
          </p>
          {selectedFile ? (
            <p className="mt-1 text-xs text-muted-fg">
              {t("page.datasource.selectedFile")}: {selectedFile.name}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="upload-alias">
            {t("page.datasource.aliasLabel")}
          </Label>
          <Input
            id="upload-alias"
            value={uploadAlias}
            onChange={e => onUploadAliasChange(e.target.value)}
            placeholder={t("page.datasource.aliasPlaceholder")}
          />
          <p className="text-xs text-muted-foreground">
            {t("page.datasource.uploadAliasHelper")}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button onClick={onUpload} disabled={uploading || !selectedFile}>
            {uploading && uploadProgress !== null
              ? t("page.datasource.uploadingPercent", {
                  percent: uploadProgress,
                  defaultValue: `上传中 ${uploadProgress}%`,
                })
              : uploading
                ? t("page.datasource.connection.saving")
                : t("page.datasource.btnStartUpload")}
          </Button>
          <Button variant="ghost" onClick={onClear}>
            {t("page.datasource.paste.btnClear")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
