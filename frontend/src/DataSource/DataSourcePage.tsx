import type { ReactNode } from "react";
import DrawerAddSource from "./DrawerAddSource";

export interface DataSourcePageProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  tabs?: { id: string; label: string }[];
  headerTitle?: string;
  headerActions?: ReactNode;
  topIntro?: ReactNode;
  uploadPanel?: ReactNode;
  databasePanel?: ReactNode;
  pastePanel?: ReactNode;
  savedConnectionsPanel?: ReactNode;
  savedConnectionsTabs?: string[];
  drawerOpen?: boolean;
  onCloseDrawer?: () => void;
  drawerContent?: ReactNode;
}

/**
 * DataSource 主页面容器，只负责内容区布局：
 * - 视图 A: 文件上传（UploadPanel 内部自行使用 2 列 Grid）
 * - 视图 B: 数据库管理（左表单 / 右已保存列表）
 * - 视图 C: 数据粘贴板（单列）
 * Header 上的 Tab 由上层 DuckQueryApp + DataSourceTabs 控制。
 */
const DataSourcePage = ({
  activeTab = "upload",
  topIntro,
  uploadPanel,
  databasePanel,
  pastePanel,
  savedConnectionsPanel,
  savedConnectionsTabs = ["upload", "database", "paste"],
  drawerOpen = false,
  onCloseDrawer,
  drawerContent,
}: DataSourcePageProps) => {
  const showSaved =
    Array.isArray(savedConnectionsTabs) &&
    savedConnectionsTabs.includes(activeTab);

  const renderBody = () => {
    if (activeTab === "upload") {
      return uploadPanel || null;
    }

    if (activeTab === "database") {
      return (
        <div className="space-y-8">
          {showSaved ? <div>{savedConnectionsPanel}</div> : null}
          <div className="space-y-4">{databasePanel}</div>
        </div>
      );
    }

    if (activeTab === "paste") {
      return <div className="grid grid-cols-1 gap-6">{pastePanel || null}</div>;
    }

    return null;
  };

  return (
    <div className="flex flex-col h-full font-ds-sans">
      <div className="flex-1 overflow-auto p-6">
        {topIntro}
        {renderBody()}
      </div>

      <DrawerAddSource open={drawerOpen} onClose={onCloseDrawer}>
        {drawerContent}
      </DrawerAddSource>
    </div>
  );
};

export default DataSourcePage;
