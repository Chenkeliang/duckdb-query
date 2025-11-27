import { IconButton, Tab, Tabs } from "@mui/material";
import { Github, Info, Moon, Sun } from "lucide-react";
import React, { Suspense, lazy, useEffect } from "react";
import { useTranslation } from "react-i18next";
import DataUploadSection from "./components/DataSourceManagement/DataUploadSection";
import DatabaseConnector from "./components/DataSourceManager/DatabaseConnector";
import DataPasteBoard from "./components/DataSourceManager/DataPasteBoard";
import DataSourceList from "./components/DataSourceManager/DataSourceList";
import WelcomePage from "./components/WelcomePage";
import { ToastProvider, useToast } from "./contexts/ToastContext";
import useDuckQuery from "./hooks/useDuckQuery";
import duckLogoDark from "./assets/duckquery-dark.svg";
import duckLogoLight from "./assets/Duckquerylogo.svg";

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

const LazyFallback = () => {
  const { t } = useTranslation("common");
  return (
    <div className="p-6 dq-text-tertiary text-sm">{t("actions.loading")}</div>
  );
};

const ShadcnApp = () => {
  const { showSuccess, showError, showWarning, showInfo } = useToast();
  const { state, actions } = useDuckQuery();
  const { t, i18n } = useTranslation("common");
  const locale = i18n.language || "zh";
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

  // Dynamically load modern.css only for this component
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/src/styles/modern.css';
    link.id = 'modern-css-legacy';
    document.head.appendChild(link);

    return () => {
      // Clean up when component unmounts
      document.getElementById('modern-css-legacy')?.remove();
    };
  }, []);

  if (showWelcome) {
    return <WelcomePage onStartUsing={handleCloseWelcome} />;
  }

  const themeClassName = `dq-theme ${isDarkMode ? "dq-theme--dark" : "dq-theme--light"
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
                {t("actions.tryNewLayout")}
              </button>
              <IconButton
                size="small"
                disableRipple
                onClick={() => setIsDarkMode(prev => !prev)}
                aria-label={
                  isDarkMode
                    ? t("actions.toggleLight")
                    : t("actions.toggleDark")
                }
                title={
                  isDarkMode
                    ? t("actions.toggleLight")
                    : t("actions.toggleDark")
                }
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
              aria-label={t("nav.switchMain")}
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
              <Tab
                disableRipple
                value="datasource"
                label={t("nav.datasource")}
              />
              <Tab
                disableRipple
                value="unifiedquery"
                label={t("nav.unifiedquery")}
              />
              <Tab
                disableRipple
                value="tablemanagement"
                label={t("nav.tablemanagement")}
              />
              <Tab
                disableRipple
                value="asynctasks"
                label={t("nav.asynctasks")}
              />
            </Tabs>
          </div>

          {currentTab === "datasource" && (
            <div className="p-6">
              <div className="page-intro">
                <div className="page-intro-content">
                  <div className="page-intro-desc">
                    <div>{t("page.datasource.intro1")}</div>
                    <div>{t("page.datasource.intro2")}</div>
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
                    <div>{t("page.unifiedquery.intro1")}</div>
                    <div>{t("page.unifiedquery.intro2")}</div>
                    <div>{t("page.unifiedquery.intro3")}</div>
                    <div>{t("page.unifiedquery.intro4")}</div>
                    <div>{t("page.unifiedquery.intro5")}</div>
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
                            ? t("page.unifiedquery.resultVisual")
                            : queryResults.isSetOperation
                              ? t("page.unifiedquery.resultSet")
                              : t("page.unifiedquery.resultQuery")
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
                    <div>{t("page.table.intro1")}</div>
                    <div>{t("page.table.intro2")}</div>
                    <div>{t("page.table.intro3")}</div>
                  </div>
                </div>
              </div>

              <div className="dq-shell mb-6">
                <Tabs
                  value={tableManagementTab}
                  onChange={(_, value) => setTableManagementTab(value)}
                  aria-label={t("page.table.groupAria")}
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
                  <Tab
                    disableRipple
                    value="duckdb"
                    label={t("page.table.tabDuck")}
                  />
                  <Tab
                    disableRipple
                    value="external"
                    label={t("page.table.tabExternal")}
                  />
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
                    <div>{t("page.async.intro1")}</div>
                    <div>{t("page.async.intro2")}</div>
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
