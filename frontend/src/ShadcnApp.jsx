import { IconButton, Tab, Tabs } from "@mui/material";
import { Github, Info, Moon, Sun } from "lucide-react";
import React, { Suspense, lazy } from "react";
import DataUploadSection from "./components/DataSourceManagement/DataUploadSection";
import DatabaseConnector from "./components/DataSourceManager/DatabaseConnector";
import DataPasteBoard from "./components/DataSourceManager/DataPasteBoard";
import DataSourceList from "./components/DataSourceManager/DataSourceList";
import WelcomePage from "./components/WelcomePage";
import { ToastProvider, useToast } from "./contexts/ToastContext";
import useDuckQuery from "./hooks/useDuckQuery";
import duckLogoDark from "./assets/duckquery-dark.svg";
import duckLogoLight from "./assets/Duckquerylogo.svg";
import "./styles/modern.css";

const AsyncTaskList = lazy(() =>
  import("./components/AsyncTasks/AsyncTaskList")
);
const DatabaseTableManager = lazy(() =>
  import("./components/DatabaseManager/DatabaseTableManager")
);
const DuckDBManagementPage = lazy(() =>
  import("./components/DuckDBManager/DuckDBManagementPage")
);
const ModernDataDisplay = lazy(() =>
  import("./components/Results/ModernDataDisplay")
);
const UnifiedQueryInterface = lazy(() =>
  import("./components/UnifiedQueryInterface/UnifiedQueryInterface")
);

const LazyFallback = () => (
  <div className="p-6 dq-text-tertiary text-sm">模块加载中...</div>
);

const ShadcnApp = () => {
  const { showSuccess, showError, showWarning, showInfo } = useToast();
  const { state, actions } = useDuckQuery();
  const {
    showWelcome,
    isDarkMode,
    currentTab,
    tableManagementTab,
    dataSources,
    databaseConnections,
    selectedSources,
    queryResults,
    activeFilters,
    resultsLoading
  } = state;

  const {
    setShowWelcome,
    setIsDarkMode,
    setCurrentTab,
    setTableManagementTab,
    setSelectedSources,
    setPreviewQuery,
    triggerRefresh,
    handleResultsReceived,
    handleApplyResultFilters,
    handleDatabaseConnect,
    handleCloseWelcome
  } = actions;

  if (showWelcome) {
    return <WelcomePage onStartUsing={handleCloseWelcome} />;
  }

  const themeClassName = `dq-theme ${
    isDarkMode ? "dq-theme--dark" : "dq-theme--light"
  }`;

  const switchToNewLayout = () => {
    localStorage.setItem("dq-use-new-layout", "1");
    window.location.href = `${window.location.pathname}?layout=new`;
  };

  return (
    <div className={`${themeClassName} dq-page min-h-screen`}>
      <header className="dq-topbar">
        <div className="w-full px-6 py-2">
          <div className="flex items-center justify-between">
            <div
              className="dq-header-brand flex items-center gap-3"
              style={{
                minHeight: 72,
                padding: "0.35rem 1.25rem",
                marginLeft: "-40px"
              }}
            >
              <img
                src={isDarkMode ? duckLogoDark : duckLogoLight}
                alt="Duck Query"
                className="select-none"
                draggable={false}
                style={{
                  width: 175,
                  height: 60,
                  objectFit: "contain",
                  display: "block"
                }}
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={switchToNewLayout}
                className="hidden md:flex items-center gap-2 rounded-card border border-[var(--dq-border-subtle)] bg-[var(--dq-surface)] px-3 py-2 text-sm font-medium text-[var(--dq-text-primary)] transition-colors hover:border-[var(--dq-border-hover)] hover:bg-[var(--dq-surface-hover)]"
              >
                试用新布局
              </button>
              <IconButton
                size="small"
                disableRipple
                onClick={() => setIsDarkMode(prev => !prev)}
                aria-label={isDarkMode ? "切换为浅色模式" : "切换为暗色模式"}
                title={isDarkMode ? "切换为浅色模式" : "切换为暗色模式"}
                sx={{
                  width: 42,
                  height: 42,
                  borderRadius: "12px",
                  border: "1.5px solid var(--dq-accent-primary)",
                  backgroundColor: "var(--dq-surface)",
                  color: "var(--dq-accent-primary)",
                  transition:
                    "background-color 0.18s ease, color 0.18s ease, border-color 0.18s ease",
                  "&:hover": {
                    backgroundColor: "var(--dq-accent-primary)",
                    color: "var(--dq-text-on-primary)",
                    borderColor: "var(--dq-accent-primary)"
                  }
                }}
              >
                {isDarkMode ? (
                  <Sun className="h-5 w-5" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </IconButton>
              <IconButton
                size="small"
                component="a"
                href="https://github.com/chenkeliang/duckdb-query"
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  width: 42,
                  height: 42,
                  borderRadius: "12px",
                  border: "1.5px solid var(--dq-accent-primary)",
                  backgroundColor: "var(--dq-surface)",
                  color: "var(--dq-accent-primary)",
                  transition:
                    "background-color 0.18s ease, color 0.18s ease, border-color 0.18s ease",
                  "&:hover": {
                    backgroundColor: "var(--dq-accent-primary)",
                    color: "var(--dq-text-on-primary)",
                    borderColor: "var(--dq-accent-primary)"
                  }
                }}
              >
                <Github className="h-5 w-5" />
              </IconButton>
              <IconButton
                size="small"
                disableRipple
                onClick={() => {
                  setShowWelcome(true);
                  const welcomeShownKey = "duck-query-welcome-shown";
                  localStorage.setItem(
                    welcomeShownKey,
                    new Date().toISOString()
                  );
                }}
                sx={{
                  width: 42,
                  height: 42,
                  borderRadius: "12px",
                  border: "1.5px solid var(--dq-accent-primary)",
                  backgroundColor: "var(--dq-surface)",
                  color: "var(--dq-accent-primary)",
                  transition:
                    "background-color 0.18s ease, color 0.18s ease, border-color 0.18s ease",
                  "&:hover": {
                    backgroundColor: "var(--dq-accent-primary)",
                    color: "var(--dq-text-on-primary)",
                    borderColor: "var(--dq-accent-primary)"
                  }
                }}
              >
                <Info className="h-5 w-5" />
              </IconButton>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full px-6 py-8">
        <div className="dq-shell mb-6">
          <div className="mantine-tabs">
            <Tabs
              value={currentTab}
              onChange={(_, value) => setCurrentTab(value)}
              variant="scrollable"
              scrollButtons={false}
              aria-label="主功能切换"
              sx={{
                minHeight: 0,
                px: 2.5,
                pt: 1.5,
                pb: 1,
                borderBottom: "1px solid var(--dq-border-subtle)",
                backgroundColor: "var(--dq-surface)",
                "& .MuiTabs-indicator": {
                  backgroundColor: "var(--dq-tab-indicator)",
                  height: "var(--dq-tab-indicator-height)",
                  borderRadius: 999
                },
                "& .MuiTabs-flexContainer": {
                  gap: "calc(var(--dq-tab-gap) + 4px)"
                },
                "& .MuiTab-root": {
                  minHeight: 0,
                  minWidth: "auto",
                  padding:
                    "calc(var(--dq-tab-padding-y) + 4px) calc(var(--dq-tab-padding-x) + 6px)",
                  color: "var(--dq-tab-text)",
                  fontSize: "var(--dq-tab-font-size-primary)",
                  fontWeight: "var(--dq-tab-font-weight-primary-inactive)",
                  textTransform: "none",
                  letterSpacing: "-0.01em",
                  borderRadius: 0,
                  lineHeight: 1.6,
                  "&:hover": {
                    color: "var(--dq-tab-text-active)"
                  }
                },
                "& .MuiTab-root.Mui-selected": {
                  color: "var(--dq-tab-active-color)",
                  fontWeight: "var(--dq-tab-font-weight-primary)"
                }
              }}
            >
              <Tab disableRipple value="datasource" label="数据源" />
              <Tab disableRipple value="unifiedquery" label="统一查询" />
              <Tab disableRipple value="tablemanagement" label="数据表管理" />
              <Tab disableRipple value="asynctasks" label="异步任务" />
            </Tabs>
          </div>

          {currentTab === "datasource" && (
            <div className="p-6">
              <div className="page-intro">
                <div className="page-intro-content">
                  <div className="page-intro-desc">
                    <div>
                      <strong>上传文件：</strong>
                      支持<b>剪切板/CSV/Excel/JSON/Parquet/远程文件</b>
                      等多类型上传，自动建表用于数据分析查询，默认最大50GB，支持自定义配置
                    </div>
                    <div>
                      <strong>支持连接远程数据库：</strong>
                      支持<b>MySQL / PostgreSQL</b>
                      配置之后可在查询页面查询数据加载到本地表中
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="dq-shell p-6">
                  <DataUploadSection
                    onDataSourceSaved={triggerRefresh}
                    showNotification={(message, severity) => {
                      switch (severity) {
                        case "success":
                          showSuccess(message);
                          break;
                        case "error":
                          showError(message);
                          break;
                        case "warning":
                          showWarning(message);
                          break;
                        case "info":
                        default:
                          showInfo(message);
                          break;
                      }
                    }}
                  />
                </div>

                <div className="dq-shell p-6">
                  <DatabaseConnector onConnect={handleDatabaseConnect} />
                </div>

                <div className="dq-shell p-6">
                  <DataPasteBoard onDataSourceSaved={triggerRefresh} />
                </div>

                <div className="dq-shell p-6">
                  <DataSourceList
                    dataSources={dataSources}
                    databaseConnections={databaseConnections}
                    onRefresh={triggerRefresh}
                  />
                </div>
              </div>
            </div>
          )}

          {currentTab === "unifiedquery" && (
            <div className="p-6">
              <div className="page-intro">
                <div className="page-intro-content">
                  <div className="page-intro-desc">
                    <div>
                      <strong>图形化查询：</strong>
                      像用Excel筛选+排序一样，一键选字段、加条件、排结果（无需写SQL），生成数据分析结果
                    </div>
                    <div>
                      <strong>SQL编辑器：</strong>
                      可通过内部数据进行查询已上传数据表以及外部数据库加载至内部数据中，支持DUCKDB完整SQL语法
                    </div>
                    <div>
                      <strong>跨数据融合：</strong>
                      像ExcelVLOOKUP一样，一键把上传的多种类型数据，通过共同字段（如订单号、用户ID）横向合并宽表
                    </div>
                    <div>
                      <strong>跨数据汇总：</strong>
                      像Excel复制粘贴多张报表一样，一键把多份相似表格(1月、2月销售数据)垂直堆叠一份信息，支持字段不同的合并
                    </div>
                    <div>
                      <strong>数据预览导出：</strong>
                      页面最大支持1万条数据预览，支持异步任务产出新表再分析，导出支持CSV/Parquet格式
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <Suspense fallback={<LazyFallback />}>
                  <UnifiedQueryInterface
                    dataSources={[...dataSources]
                      .filter(
                        ds => ds.type === "duckdb" || ds.sourceType === "duckdb"
                      )
                      .sort((a, b) => {
                        const timeA = a.createdAt
                          ? new Date(a.createdAt)
                          : new Date(0);
                        const timeB = b.createdAt
                          ? new Date(b.createdAt)
                          : new Date(0);
                        if (!a.createdAt && !b.createdAt) return 0;
                        if (!a.createdAt) return 1;
                        if (!b.createdAt) return -1;
                        return timeB - timeA;
                      })}
                    databaseConnections={databaseConnections}
                    selectedSources={selectedSources}
                    setSelectedSources={setSelectedSources}
                    onResultsReceived={handleResultsReceived}
                    onDataSourceSaved={() => {
                      triggerRefresh();
                    }}
                    onRefresh={triggerRefresh}
                  />
                </Suspense>

                {queryResults.data && (
                  <div className="dq-shell p-6">
                    <Suspense fallback={<LazyFallback />}>
                      <ModernDataDisplay
                        data={queryResults.data || []}
                        columns={
                          queryResults.columns
                            ? queryResults.columns.map((col, index) => {
                                const fieldValue =
                                  typeof col === "string"
                                    ? col
                                    : col.name ||
                                      col.field ||
                                      `column_${index}`;
                                const headerValue =
                                  typeof col === "string"
                                    ? col
                                    : col.headerName ||
                                      col.name ||
                                      col.field ||
                                      `column_${index}`;
                                return {
                                  field: fieldValue,
                                  headerName: headerValue,
                                  sortable: true,
                                  filter: true,
                                  resizable: true
                                };
                              })
                            : []
                        }
                        loading={resultsLoading}
                        title={
                          queryResults.isVisualQuery
                            ? "可视化查询结果"
                            : queryResults.isSetOperation
                            ? "集合操作结果"
                            : "查询结果"
                        }
                        sqlQuery={
                          queryResults.sqlQuery || queryResults.sql || ""
                        }
                        originalDatasource={queryResults.originalDatasource}
                        onApplyFilters={handleApplyResultFilters}
                        activeFilters={activeFilters}
                        isVisualQuery={queryResults.isVisualQuery || false}
                        visualConfig={queryResults.visualConfig || null}
                        generatedSQL={queryResults.generatedSQL || ""}
                        isSetOperation={queryResults.isSetOperation || false}
                        setOperationConfig={
                          queryResults.setOperationConfig || null
                        }
                        onRefresh={triggerRefresh}
                        onDataSourceSaved={triggerRefresh}
                      />
                    </Suspense>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentTab === "tablemanagement" && (
            <div className="p-6">
              <div className="page-intro">
                <div className="page-intro-content">
                  <div className="page-intro-desc">
                    <div>
                      <strong>数据管理：</strong>
                      管理DuckDB内部表、外部数据库表
                    </div>
                    <div>
                      <strong>表管理：</strong>
                      查看表结构，一键复制表名，删除不需要的表
                    </div>
                    <div>
                      <strong>分组展示：</strong>
                      异步结果表、普通表、临时表分组清晰展示
                    </div>
                  </div>
                </div>
              </div>

              <div className="dq-shell mb-6">
                <Tabs
                  value={tableManagementTab}
                  onChange={(_, value) => setTableManagementTab(value)}
                  aria-label="数据表管理分组"
                  sx={{
                    px: 2,
                    pt: 1.25,
                    pb: 0.75,
                    borderBottom: "1px solid var(--dq-border-subtle)",
                    "& .MuiTabs-indicator": {
                      backgroundColor: "var(--dq-tab-indicator)",
                      height: "var(--dq-tab-indicator-height)",
                      borderRadius: 999
                    },
                    "& .MuiTabs-flexContainer": {
                      gap: "calc(var(--dq-tab-gap) + 4px)"
                    },
                    "& .MuiTab-root": {
                      minHeight: 0,
                      minWidth: "auto",
                      padding:
                        "calc(var(--dq-tab-padding-y)) calc(var(--dq-tab-padding-x) + 4px)",
                      color: "var(--dq-tab-text)",
                      fontSize: "var(--dq-tab-font-size-secondary)",
                      fontWeight:
                        "var(--dq-tab-font-weight-secondary-inactive)",
                      textTransform: "none",
                      letterSpacing: "-0.01em",
                      borderRadius: 0,
                      "&:hover": {
                        color: "var(--dq-tab-text-active)"
                      }
                    },
                    "& .MuiTab-root.Mui-selected": {
                      color: "var(--dq-tab-active-color)",
                      fontWeight: "var(--dq-tab-font-weight-secondary)"
                    }
                  }}
                >
                  <Tab disableRipple value="duckdb" label="DuckDB管理" />
                  <Tab disableRipple value="external" label="外部数据库" />
                </Tabs>

                {tableManagementTab === "duckdb" && (
                  <div className="p-6">
                    <Suspense fallback={<LazyFallback />}>
                      <DuckDBManagementPage
                        onDataSourceChange={triggerRefresh}
                      />
                    </Suspense>
                  </div>
                )}

                {tableManagementTab === "external" && (
                  <div className="p-6">
                    <Suspense fallback={<LazyFallback />}>
                      <DatabaseTableManager
                        databaseConnections={databaseConnections}
                      />
                    </Suspense>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentTab === "asynctasks" && (
            <div className="p-6">
              <div className="page-intro">
                <div className="page-intro-content">
                  <div className="page-intro-desc">
                    <div>
                      <strong>后台运行：</strong>
                      异步任务长耗时查询在后台运行
                    </div>
                    <div>
                      <strong>结果处理：</strong>
                      自动更新进度；完成后可下载（CSV/Parquet）或保存为新表
                    </div>
                  </div>
                </div>
              </div>

              <Suspense fallback={<LazyFallback />}>
                <AsyncTaskList
                  onPreviewResult={taskId => {
                    const query = `SELECT * FROM "async_result_${taskId}" LIMIT 10000`;
                    setCurrentTab("sql");
                    setPreviewQuery(query);
                  }}
                  onTaskCompleted={() => {
                    triggerRefresh();
                  }}
                />
              </Suspense>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

const ShadcnAppWithToast = () => {
  return (
    <ToastProvider>
      <ShadcnApp />
    </ToastProvider>
  );
};

export default ShadcnAppWithToast;
