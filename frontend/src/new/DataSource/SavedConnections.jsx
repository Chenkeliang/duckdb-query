import React from "react";
import { useTranslation } from "react-i18next";

const statusStyles = {
  active: "text-success border-success-border bg-success-bg",
  ready: "text-success border-success-border bg-success-bg",
  idle: "text-muted-foreground border-border bg-surface",
  error: "text-error border-error-border bg-error-bg"
};

const SavedConnections = ({ items = [], onRefresh }) => {
  const { t } = useTranslation("common");

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground">
          {t("page.datasource.list.title")}
        </div>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {t("actions.refresh")}
          </button>
        ) : null}
      </div>

      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            {t("page.datasource.list.empty")}
          </div>
        ) : (
          items.map(item => {
            const key = (item.status || "idle").toLowerCase();
            const badge =
              statusStyles[key] ||
              "text-muted-foreground border-border bg-surface";
            return (
              <div
                key={item.id || item.name}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2"
              >
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {item.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.host}
                  </div>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border ${badge}`}
                >
                  {item.statusLabel || item.status || "READY"}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default SavedConnections;
