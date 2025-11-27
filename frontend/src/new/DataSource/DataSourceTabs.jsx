import React from "react";

/**
 * Header 内的数据源视图二级 Tab（数据库管理 / 文件上传 / 数据粘贴板）。
 * 视觉参考 datasource_preview.html Header 区域的小标签。
 */
const DataSourceTabs = ({ value = "upload", onChange, tabs }) => {
  const items = Array.isArray(tabs) ? tabs : [];
  if (!items.length) return null;

  return (
    <div className="flex bg-muted p-1 rounded-lg h-9 gap-1">
      {items.map(tab => {
        const active = tab.id === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange?.(tab.id)}
            className={`px-3 text-xs font-medium rounded-[6px] flex items-center gap-2 transition-all ${active
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted-fg hover:text-foreground"
              }`}
          >
            {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default DataSourceTabs;
