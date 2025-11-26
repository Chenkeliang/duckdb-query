import React from "react";
import { useTranslation } from "react-i18next";

const statusStyles = {
  active:
    "text-[var(--dq-status-success-fg)] border-[var(--dq-status-success-fg)]/30 bg-[var(--dq-status-success-bg)]",
  ready:
    "text-[var(--dq-status-success-fg)] border-[var(--dq-status-success-fg)]/30 bg-[var(--dq-status-success-bg)]",
  idle:
    "text-[var(--dq-text-tertiary)] border-[var(--dq-border)] bg-[var(--dq-surface)]",
  error:
    "text-[var(--dq-status-error-fg)] border-[var(--dq-status-error-fg)]/30 bg-[var(--dq-status-error-bg)]"
};

const SavedConnections = ({ items = [], onRefresh }) => {
  const { t } = useTranslation("common");

  return (
    <div className="rounded-xl border border-[var(--dq-border)] bg-[var(--dq-surface)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-[var(--dq-text-primary)]">
          {t("page.datasource.list.title")}
        </div>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            className="text-xs text-[var(--dq-text-tertiary)] hover:text-[var(--dq-text-primary)]"
          >
            {t("actions.refresh")}
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
            const key = (item.status || "idle").toLowerCase();
            const badge =
              statusStyles[key] ||
              "text-[var(--dq-text-tertiary)] border-[var(--dq-border)] bg-[var(--dq-surface)]";
            return (
              <div
                key={item.id || item.name}
                className="flex items-center justify-between rounded-lg border border-[var(--dq-border)] bg-[var(--dq-surface)] px-3 py-2"
              >
                <div>
                  <div className="text-sm font-medium text-[var(--dq-text-primary)]">
                    {item.name}
                  </div>
                  <div className="text-xs text-[var(--dq-text-tertiary)]">
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
