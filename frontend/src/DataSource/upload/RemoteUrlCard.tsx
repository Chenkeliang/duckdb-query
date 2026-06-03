import { useTranslation } from "react-i18next";
import { FileType, Link2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface RemoteUrlCardProps {
  url: string;
  remoteAlias: string;
  urlLoading: boolean;
  remoteStorageConfigured?: boolean;
  jsonImportColumnType?: string;
  onUrlChange: (url: string) => void;
  onRemoteAliasChange: (alias: string) => void;
  onImport: () => void;
}

export function RemoteUrlCard({
  url,
  remoteAlias,
  urlLoading,
  remoteStorageConfigured = false,
  jsonImportColumnType = "auto",
  onUrlChange,
  onRemoteAliasChange,
  onImport,
}: RemoteUrlCardProps) {
  const { t } = useTranslation("common");
  const isS3Url = /^s3:\/\//i.test(url.trim());
  const showS3ConfigHint = isS3Url && !remoteStorageConfigured;

  return (
    <Card className="shadow-sm">
      <CardContent className="p-6 space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {t("page.datasource.cardRemoteTitle")}
          </p>
          <h3 className="text-lg font-semibold text-foreground">
            {t("page.datasource.cardRemoteDesc")}
          </h3>
        </div>

        <div className="space-y-2">
          <Label htmlFor="remote-url" className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            {t("page.datasource.remoteUrlLabel")}
          </Label>
          <Input
            id="remote-url"
            value={url}
            onChange={e => onUrlChange(e.target.value)}
            placeholder="https://example.com/data.csv"
          />
          <p className="text-xs text-muted-foreground">
            {t("page.datasource.remoteUrlHelper")}
          </p>
          {showS3ConfigHint ? (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              {t("page.datasource.s3ConfigRequired")}
            </p>
          ) : null}
          {jsonImportColumnType === "variant" ? (
            <p className="text-xs text-muted-foreground">
              {t("page.datasource.jsonVariantDefaultHint")}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="remote-alias" className="flex items-center gap-2">
            <FileType className="h-4 w-4" />
            {t("page.datasource.remoteAliasLabel")}
          </Label>
          <Input
            id="remote-alias"
            value={remoteAlias}
            onChange={e => onRemoteAliasChange(e.target.value)}
            placeholder={t("page.datasource.remoteAliasPlaceholder")}
          />
          <p className="text-xs text-muted-foreground">
            {t("page.datasource.remoteAliasHelper")}
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={onImport}
            disabled={urlLoading || !url.trim() || !remoteAlias.trim()}
          >
            {urlLoading
              ? t("page.datasource.connection.testing")
              : t("page.datasource.btnReadRemote")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
