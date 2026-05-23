import type { LucideIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface DataSourceTabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
}

export interface DataSourceTabsProps {
  value?: string;
  onChange?: (tab: string) => void;
  tabs?: DataSourceTabItem[];
}

/**
 * Header 内的数据源视图二级 Tab（数据库管理 / 文件上传 / 数据粘贴板）。
 */
const DataSourceTabs = ({
  value = "upload",
  onChange,
  tabs = [],
}: DataSourceTabsProps) => {
  if (!tabs.length) return null;

  return (
    <Tabs value={value} onValueChange={onChange}>
      <TabsList>
        {tabs.map((tab) => {
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
