import React from "react";
import DrawerAddSource from "./DrawerAddSource";

/**
 * DataSource 主页面容器，只负责内容区布局：
 * - 视图 A: 文件上传（UploadPanel 内部自行使用 2 列 Grid）
 * - 视图 B: 数据库管理（左表单 / 右已保存列表）
 * - 视图 C: 数据粘贴板（单列）
 * Header 上的 Tab 由上层 DuckQueryApp + DataSourceTabs 控制。
 */
const DataSourcePage = ({
  activeTab = "upload",
  onTabChange,
  tabs,
  headerTitle,
  headerActions,
  topIntro,
  uploadPanel,
  databasePanel,
  pastePanel,
  savedConnectionsPanel,
  savedConnectionsTabs = ["upload", "database", "paste"],
  drawerOpen = false,
  onCloseDrawer,
  drawerContent
}) => {
  const showSaved =
    Array.isArray(savedConnectionsTabs) &&
    savedConnectionsTabs.includes(activeTab);

  const renderBody = () => {
    if (activeTab === "upload") {
      // 视图 A：智能文件上传（UploadPanel 自己内部是 1 / 2 列栅格）
      return uploadPanel || null;
    }

    if (activeTab === "database") {
      // 视图 B：数据库管理，左 2/3 表单 + 右 1/3 已保存列表
      return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-2 space-y-4">{databasePanel}</div>
          {showSaved ? (
            <div className="space-y-4">{savedConnectionsPanel}</div>
          ) : null}
        </div>
      );
    }

    // 视图 C：数据粘贴板（单列卡片）
    if (activeTab === "paste") {
      return <div className="grid grid-cols-1 gap-6">{pastePanel || null}</div>;
    }

    return null;
  };

  return (
    <div className="flex flex-col h-full">
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
