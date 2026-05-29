import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import type { FileImportMode } from "@/api";

interface ImportModeSelectProps {
  id: string;
  value: FileImportMode;
  onChange: (mode: FileImportMode) => void;
}

/** 数据类型下拉：auto / literal */
export function ImportModeSelect({ id, value, onChange }: ImportModeSelectProps) {
  const { t } = useTranslation("common");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t("page.datasource.importModeLabel")}</Label>
      <select
        id={id}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
        value={value}
        onChange={e => onChange(e.target.value as FileImportMode)}
      >
        <option value="auto">{t("page.datasource.importModeAuto")}</option>
        <option value="literal">{t("page.datasource.importModeLiteral")}</option>
        <option value="variant">{t("page.datasource.importModeVariant", "VARIANT（嵌套 JSON）")}</option>
      </select>
    </div>
  );
}
