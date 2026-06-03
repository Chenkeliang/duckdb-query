import { useTranslation } from "react-i18next";
import type { FileImportMode } from "@/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ImportModeSelectProps {
  value: FileImportMode;
  onChange: (mode: FileImportMode) => void;
}

/**
 * 数据类型（导入模式）选择 —— 紧凑内联控件，使用 shadcn Select（暗色适配、有样式）。
 * 作为上传页的一个全局轻量设置，不再占用一个大卡片框。
 */
export function ImportModeSelect({ value, onChange }: ImportModeSelectProps) {
  const { t } = useTranslation("common");
  return (
    <div className="flex items-center gap-2.5">
      <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
        {t("page.datasource.importModeLabel")}
      </span>
      <Select value={value} onValueChange={(v) => onChange(v as FileImportMode)}>
        <SelectTrigger className="h-8 w-[230px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">{t("page.datasource.importModeAuto")}</SelectItem>
          <SelectItem value="literal">{t("page.datasource.importModeLiteral")}</SelectItem>
          <SelectItem value="variant">
            {t("page.datasource.importModeVariant", "VARIANT（嵌套 JSON）")}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
