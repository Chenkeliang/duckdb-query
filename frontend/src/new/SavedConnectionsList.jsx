import React from "react";
import { useTranslation } from "react-i18next";

const statusStyles = {
  active:
    "text-green-500 bg-green-500/10 border-transparent",
  ready:
    "text-green-500 bg-green-500/10 border-transparent",
  idle:
    "text-muted-foreground border-border bg-surface",
  error:
    "text-red-500 bg-red-500/10 border-transparent",
  unknown:
    "text-muted-foreground border-border bg-surface"
};

const typeStyles =
  "text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground bg-surface";

const SavedConnectionsList = ({
  title,
  items = [],
  onRefresh,
  refreshLabel
}) => {
  const { t } = useTranslation("common");
  const safeTitle = title || t("page.datasource.list.title");
  const safeRefresh = refreshLabel || t("actions.refresh");

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground">
          {safeTitle}
        </div>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {safeRefresh}
          </button>
        ) : null}
      </div>

      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-xs text-[var(--dq-text-tertiary)]">
            {t("page.datasource.list.empty")}
          </div>
        ) : (
          items.map(item => {
            const normalized = (item.status || "unknown").toLowerCase();
            const badgeClass = statusStyles[normalized] || statusStyles.unknown;
            return (
              <div
                key={item.id || item.name}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/30 hover:border-primary/50 cursor-pointer transition-colors px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {item.name || t("page.datasource.list.unnamed")}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {item.type ? (
                      <span className={typeStyles}>{item.type}</span>
                    ) : null}
                    <div className="text-[11px] text-muted-foreground truncate">
                      {item.detail || item.host || ""}
                    </div>
                  </div>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${badgeClass}`}
                >
                  {item.statusLabel || item.status || "—"}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default SavedConnectionsList;
