import React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/new/components/ui/tabs";

/**
 * Header 内的数据源视图二级 Tab（数据库管理 / 文件上传 / 数据粘贴板）。
 * 视觉参考 datasource_preview.html Header 区域的小标签。
 * 
 * Now using shadcn/ui Tabs component.
 */
const DataSourceTabs = ({ value = "upload", onChange, tabs }) => {
  const items = Array.isArray(tabs) ? tabs : [];
  if (!items.length) return null;

  return (
    <Tabs value={value} onValueChange={onChange}>
      <TabsList>
        {items.map(tab => {
          const Icon = tab.icon;
          return (
            <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
              {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
              <span>{tab.label}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
};

export default DataSourceTabs;
