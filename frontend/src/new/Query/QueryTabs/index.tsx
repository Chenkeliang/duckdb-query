import * as React from "react";
import { Code, GitMerge, Layers, Table2, LayoutGrid } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/new/components/ui/tabs";

/**
 * 查询模式 Tab 组件
 * 
 * 职责：
 * - 显示 5 个查询模式 Tab
 * - 处理 Tab 切换
 * - 渲染对应的查询构建器
 * 
 * 样式：
 * - 与数据源管理页面的标签页保持一致
 * - 使用 shadcn/ui Tabs 默认样式（圆角、阴影）
 * - 每个标签包含图标和文字
 * 
 * TODO: 完整实现将在后续任务中完成
 */

interface QueryMode {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const queryModes: QueryMode[] = [
  { id: 'sql', label: 'SQL 查询', icon: Code },
  { id: 'join', label: 'JOIN 查询', icon: GitMerge },
  { id: 'set', label: '集合操作', icon: Layers },
  { id: 'pivot', label: '透视表', icon: Table2 },
  { id: 'visual', label: '可视化查询', icon: LayoutGrid },
];

interface QueryTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  selectedTables: string[];
  onExecute: (sql: string) => Promise<void>;
}

export const QueryTabs: React.FC<QueryTabsProps> = ({
  activeTab,
  onTabChange,
  selectedTables,
  onExecute,
}) => {
  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="h-full flex flex-col bg-surface">
      {/* 标签页导航 - 与数据源管理页面样式一致 */}
      <div className="h-12 border-b border-border flex items-center px-4 bg-muted/30 shrink-0">
        <TabsList className="flex gap-1 bg-muted p-1 rounded-lg h-9">
          {queryModes.map(mode => {
            const Icon = mode.icon;
            return (
              <TabsTrigger key={mode.id} value={mode.id} className="gap-2">
                <Icon className="w-3.5 h-3.5" />
                <span>{mode.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>

      <div className="flex-1 overflow-auto">
        <TabsContent value="sql" className="h-full m-0 p-4">
          <div className="text-sm text-muted-foreground">
            SQL 查询编辑器（待实现）
          </div>
        </TabsContent>

        <TabsContent value="join" className="h-full m-0 p-4">
          <div className="text-sm text-muted-foreground">
            JOIN 查询构建器（待实现）
          </div>
        </TabsContent>

        <TabsContent value="set" className="h-full m-0 p-4">
          <div className="text-sm text-muted-foreground">
            集合操作构建器（待实现）
          </div>
        </TabsContent>

        <TabsContent value="pivot" className="h-full m-0 p-4">
          <div className="text-sm text-muted-foreground">
            透视表构建器（待实现）
          </div>
        </TabsContent>

        <TabsContent value="visual" className="h-full m-0 p-4">
          <div className="text-sm text-muted-foreground">
            可视化查询构建器（待实现）
          </div>
        </TabsContent>
      </div>
    </Tabs>
  );
};
