import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Tab, Tabs } from "@mui/material";
import { ToastProvider, useToast } from "./contexts/ToastContext";
import useDuckQuery from "./hooks/useDuckQuery";
import { Github, Languages, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";

import MainLayout from "./components/Layout/MainLayout";
import Sidebar from "./components/Layout/Sidebar";
import Header from "./components/Layout/Header";

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
const DataUploadSection = lazy(() =>
  import("./components/DataSourceManagement/DataUploadSection")
);
const DatabaseConnector = lazy(() =>
  import("./components/DataSourceManager/DatabaseConnector")
);
const DataPasteBoard = lazy(() =>
  import("./components/DataSourceManager/DataPasteBoard")
);
const DataSourceList = lazy(() =>
  import("./components/DataSourceManager/DataSourceList")
);
const WelcomePage = lazy(() => import("./components/WelcomePage"));

const LazyFallback = () => {
  const { t } = useTranslation("common");
  return (
    <div className="p-6 dq-text-tertiary text-sm">{t("actions.loading")}</div>
  );
};

const tabTitles = {
  datasource: "nav.datasource",
  unifiedquery: "nav.unifiedquery",
  tablemanagement: "nav.tablemanagement",
  asynctasks: "nav.asynctasks"
};

const DuckQueryAppInner = () => {
  const { showSuccess, showError, showWarning, showInfo } = useToast();
  const { state, actions } = useDuckQuery();
  const { t, i18n } = useTranslation("common");
  const locale = i18n.language || "zh";
  const [isMobile, setIsMobile] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarPinned, setIsSidebarPinned] = useState(true);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);

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
    resultsLoading,
    githubStars
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

  const visualQuerySources = useMemo(
    () =>
      [...dataSources]
        .filter(ds => ds.type === "duckdb" || ds.sourceType === "duckdb")
        .sort((a, b) => {
          const timeA = a.createdAt ? new Date(a.createdAt) : new Date(0);
          const timeB = b.createdAt ? new Date(b.createdAt) : new Date(0);
          if (!a.createdAt && !b.createdAt) return 0;
          if (!a.createdAt) return 1;
          if (!b.createdAt) return -1;
          return timeB - timeA;
        }),
    [dataSources]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (isMobile) {
      setIsSidebarOpen(false);
    }
  }, [currentTab, isMobile]);

  const toggleLocale = () => {
    const next = locale.startsWith("zh") ? "en" : "zh";
    i18n.changeLanguage(next);
    try {
      localStorage.setItem("dq-locale", next);
    } catch {
      // ignore
    }
  };
  const openGithub = () =>
    window.open(
      "https://github.com/chenkeliang/duckdb-query",
      "_blank",
      "noopener,noreferrer"
    );

  const effectiveSidebarExpanded = isMobile ? true : isSidebarExpanded;

  const handleSidebarEnter = () => {};

  const handleSidebarLeave = () => {};

  const handleSidebarPinToggle = () => {
    setIsSidebarPinned(prev => {
      const next = !prev;
      setIsSidebarExpanded(next);
      return next;
    });
  };

  if (showWelcome) {
    return <WelcomePage onStartUsing={handleCloseWelcome} />;
  }

  const renderContent = () => {
    if (currentTab === "datasource") {
      return (
        <div className="p-6">
          <div className="page-intro">
            <div className="page-intro-content">
              <div className="page-intro-desc">
                <div>{t("page.datasource.intro1")}</div>
                <div>{t("page.datasource.intro2")}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="dq-shell p-6">
              <Suspense fallback={<LazyFallback />}>
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
              </Suspense>
            </div>

            <div className="dq-shell p-6">
              <Suspense fallback={<LazyFallback />}>
                <DatabaseConnector onConnect={handleDatabaseConnect} />
              </Suspense>
            </div>

            <div className="dq-shell p-6">
              <Suspense fallback={<LazyFallback />}>
                <DataPasteBoard onDataSourceSaved={triggerRefresh} />
              </Suspense>
            </div>

            <div className="dq-shell p-6">
              <Suspense fallback={<LazyFallback />}>
                <DataSourceList
                  dataSources={dataSources}
                  databaseConnections={databaseConnections}
                  onRefresh={triggerRefresh}
                />
              </Suspense>
            </div>
          </div>
        </div>
      );
    }

    if (currentTab === "unifiedquery") {
      return (
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
                dataSources={visualQuerySources}
                databaseConnections={databaseConnections}
                selectedSources={selectedSources}
                setSelectedSources={setSelectedSources}
                onResultsReceived={handleResultsReceived}
                onDataSourceSaved={triggerRefresh}
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
                                : col.name || col.field || `column_${index}`;
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
                    sqlQuery={queryResults.sqlQuery || queryResults.sql || ""}
                    originalDatasource={queryResults.originalDatasource}
                    onApplyFilters={handleApplyResultFilters}
                    activeFilters={activeFilters}
                    isVisualQuery={queryResults.isVisualQuery || false}
                    visualConfig={queryResults.visualConfig || null}
                    generatedSQL={queryResults.generatedSQL || ""}
                    isSetOperation={queryResults.isSetOperation || false}
                    setOperationConfig={queryResults.setOperationConfig || null}
                    onRefresh={triggerRefresh}
                    onDataSourceSaved={triggerRefresh}
                  />
                </Suspense>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (currentTab === "tablemanagement") {
      return (
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
                  fontWeight: "var(--dq-tab-font-weight-secondary-inactive)",
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
                  <DuckDBManagementPage onDataSourceChange={triggerRefresh} />
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
      );
    }

    if (currentTab === "asynctasks") {
      return (
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
      );
    }

    return null;
  };

  const MobileActionButton = ({ icon: Icon, label, onClick, href }) => {
    const common =
      "flex h-10 w-10 items-center justify-center rounded-card border border-[var(--dq-border-subtle)] bg-[var(--dq-surface)] text-[var(--dq-text-primary)] transition-colors hover:border-[var(--dq-border-hover)] hover:bg-[var(--dq-surface-hover)]";
    if (href) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={common}
          aria-label={label}
        >
          <Icon className="h-5 w-5" />
        </a>
      );
    }
    return (
      <button
        type="button"
        className={common}
        onClick={onClick}
        aria-label={label}
      >
        <Icon className="h-5 w-5" />
      </button>
    );
  };

  return (
    <div className="dq-new-theme min-h-screen">
      <MainLayout
        sidebar={
          <Sidebar
            currentTab={currentTab}
            onTabChange={setCurrentTab}
            isDarkMode={isDarkMode}
            isExpanded={effectiveSidebarExpanded}
            isPinned={isSidebarPinned}
            locale={locale}
            onLocaleChange={toggleLocale}
            onToggleTheme={() => setIsDarkMode(prev => !prev)}
            onOpenGithub={openGithub}
            githubStars={githubStars}
            onShowWelcome={() => {
              setShowWelcome(true);
              const welcomeShownKey = "duck-query-welcome-shown";
              localStorage.setItem(welcomeShownKey, new Date().toISOString());
            }}
            onSwitchLegacy={() => {
              localStorage.removeItem("dq-use-new-layout");
              window.location.href = window.location.pathname;
            }}
            onTogglePin={handleSidebarPinToggle}
            t={t}
          />
        }
        header={
          <Header
            title={t(tabTitles[currentTab]) || "Duck Query"}
            onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
            rightContent={
              <div className="flex items-center gap-2 lg:hidden">
                <MobileActionButton
                  icon={isDarkMode ? Sun : Moon}
                  label={
                    isDarkMode
                      ? t("actions.toggleLight")
                      : t("actions.toggleDark")
                  }
                  onClick={() => setIsDarkMode(prev => !prev)}
                />
                <MobileActionButton
                  icon={Languages}
                  label={t("actions.toggleLang")}
                  onClick={toggleLocale}
                />
                <MobileActionButton
                  icon={Github}
                  label="GitHub"
                  onClick={openGithub}
                />
              </div>
            }
          />
        }
        isSidebarOpen={isSidebarOpen}
        onCloseSidebar={() => setIsSidebarOpen(false)}
        isSidebarExpanded={effectiveSidebarExpanded}
        onSidebarEnter={handleSidebarEnter}
        onSidebarLeave={handleSidebarLeave}
      >
        {renderContent()}
      </MainLayout>
    </div>
  );
};

const DuckQueryApp = () => (
  <ToastProvider>
    <DuckQueryAppInner />
  </ToastProvider>
);

export default DuckQueryApp;
