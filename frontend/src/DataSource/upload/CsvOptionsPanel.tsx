import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface CsvOptions {
  delimiter?: string;
  /** undefined = auto (don't send), true/false = explicit */
  hasHeader?: boolean;
  encoding?: string;
}

interface CsvOptionsPanelProps {
  value: CsvOptions;
  onChange: (opts: CsvOptions) => void;
}

// 必须是 DuckDB read_csv 认可的编码名（DuckDB 不支持 "GBK"，GB18030 是其超集，覆盖 GBK/GB2312）
const ENCODING_OPTIONS: { value: string; label: string }[] = [
  { value: "UTF-8", label: "UTF-8" },
  { value: "GB18030", label: "GB18030 (GBK/GB2312)" },
  { value: "BIG5", label: "BIG5" },
  { value: "LATIN1", label: "Latin-1" },
  { value: "WINDOWS-1252", label: "Windows-1252" },
  { value: "UTF-16", label: "UTF-16" },
];

/** Sentinel value for the "auto" Select option */
const AUTO_SENTINEL = "__auto__";

export function CsvOptionsPanel({ value, onChange }: CsvOptionsPanelProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);

  const headerSelectValue =
    value.hasHeader === true
      ? "true"
      : value.hasHeader === false
        ? "false"
        : AUTO_SENTINEL;

  const encodingSelectValue = value.encoding ?? AUTO_SENTINEL;

  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="font-medium">
          {t("page.datasource.csvOptions.title")}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          {/* Delimiter */}
          <div className="space-y-1">
            <Label className="text-xs">
              {t("page.datasource.csvOptions.delimiter")}
            </Label>
            <Input
              className="h-8 font-ds-mono text-xs"
              value={value.delimiter ?? ""}
              placeholder={t("page.datasource.csvOptions.delimiterPlaceholder")}
              onChange={e =>
                onChange({
                  ...value,
                  delimiter: e.target.value || undefined,
                })
              }
            />
          </div>

          {/* Header */}
          <div className="space-y-1">
            <Label className="text-xs">
              {t("page.datasource.csvOptions.header")}
            </Label>
            <Select
              value={headerSelectValue}
              onValueChange={v =>
                onChange({
                  ...value,
                  hasHeader:
                    v === AUTO_SENTINEL
                      ? undefined
                      : v === "true",
                })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO_SENTINEL} className="text-xs">
                  {t("page.datasource.csvOptions.headerAuto")}
                </SelectItem>
                <SelectItem value="true" className="text-xs">
                  {t("page.datasource.csvOptions.headerYes")}
                </SelectItem>
                <SelectItem value="false" className="text-xs">
                  {t("page.datasource.csvOptions.headerNo")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Encoding */}
          <div className="space-y-1">
            <Label className="text-xs">
              {t("page.datasource.csvOptions.encoding")}
            </Label>
            <Select
              value={encodingSelectValue}
              onValueChange={v =>
                onChange({
                  ...value,
                  encoding: v === AUTO_SENTINEL ? undefined : v,
                })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO_SENTINEL} className="text-xs">
                  {t("page.datasource.csvOptions.encodingAuto")}
                </SelectItem>
                {ENCODING_OPTIONS.map(enc => (
                  <SelectItem key={enc.value} value={enc.value} className="text-xs">
                    {enc.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
