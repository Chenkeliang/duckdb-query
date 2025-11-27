import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Tab, Tabs } from "@mui/material";
import { ToastProvider, useToast } from "./contexts/ToastContext";
import useDuckQuery from "./hooks/useDuckQuery";
import {
  Github,
  Languages,
  Moon,
  Sun,
  Database,
  LayoutGrid,
  Table,
  ListTodo,
  Server,
  Upload,
  ClipboardEdit,
  Settings
} from "lucide-react";
import { useTranslation } from "react-i18next";

import PageShell from "./new/Layout/PageShell";
import Sidebar from "./new/Layout/Sidebar";
import Header from "./new/Layout/Header";
import DataSourcePage from "./new/DataSource/DataSourcePage";
import DatabaseForm from "./new/DataSource/DatabaseForm";
import UploadPanel from "./new/DataSource/UploadPanel";
import DataSourceTabs from "./new/DataSource/DataSourceTabs";
import SavedConnectionsList from "./new/DataSource/SavedConnectionsList";

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
import DataPasteCard from "./new/DataSource/DataPasteCard";

import LogoLight from "./assets/Duckquerylogo.svg";
import LogoDark from "./assets/duckquery-dark.svg";
const WelcomePage = lazy(() => import("./components/WelcomePage"));

const LazyFallback = () => {
  const { t } = useTranslation("common");
  return (
    <div className="p-6 dq-text-tertiary text-sm">{t("actions.loading")}</div>
  );
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center">
          <div className="text-red-500 font-bold mb-2">
            Something went wrong
          </div>
          <div className="text-sm text-gray-500">
            {this.state.error?.message}
          </div>
          <button
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            onClick={() => window.location.reload()}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

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
  const [dataSourceTab, setDataSourceTab] = useState("upload");
  const [savingDb, setSavingDb] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [refreshConfigs, setRefreshConfigs] = useState(0);
  const [testingDb, setTestingDb] = useState(false);

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
    handleDatabaseSaveConfig,
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
  if (showWelcome) {
    return <WelcomePage onStartUsing={handleCloseWelcome} />;
  }

  const renderContent = () => {
    if (currentTab === "datasource") {
      const dataSourceTabs = [
        { id: "database", label: t("page.datasource.tabDb"), icon: Server },
        { id: "upload", label: t("page.datasource.tabUpload"), icon: Upload },
        {
          id: "paste",
          label: t("page.datasource.tabPaste"),
          icon: ClipboardEdit
        }
      ];
      const uploadPanel = (
        <UploadPanel
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
      );

      const handleTestConnection = async params => {
        try {
          setTestingDb(true);
          const { testDatabaseConnection } = await import(
            "./services/apiClient"
          );
          const result = await testDatabaseConnection({
            type: params.type,
            params: params.params
          });
          if (result?.success) {
            showSuccess(
              result?.message || t("page.datasource.list.testSuccess")
            );
          } else {
            showError(result?.message || t("page.datasource.list.testFail"));
          }
        } catch (err) {
          showError(err?.message || t("page.datasource.list.testFail"));
        } finally {
          setTestingDb(false);
        }
      };

      const handleSaveConnection = async params => {
        try {
          setSavingDb(true);
          const response = await handleDatabaseConnect(params);
          if (response?.success) {
            showSuccess(
              response?.message || t("page.datasource.manage.saveSuccess")
            );
            setRefreshConfigs(prev => prev + 1);
          } else {
            showError(
              response?.message || t("page.datasource.list.errorUnknown")
            );
          }
        } catch (err) {
          showError(err?.message || t("page.datasource.list.errorUnknown"));
        } finally {
          setSavingDb(false);
        }
      };

      const handleSaveConfig = async params => {
        try {
          setSavingDb(true);
          const response = await handleDatabaseSaveConfig(params);
          if (response?.success) {
            showSuccess(
              response?.message || t("page.datasource.manage.saveSuccess")
            );
            setRefreshConfigs(prev => prev + 1);
          } else {
            showError(
              response?.message || t("page.datasource.list.errorUnknown")
            );
          }
        } catch (err) {
          showError(err?.message || t("page.datasource.list.errorUnknown"));
        } finally {
          setSavingDb(false);
        }
      };

      const databasePanel = (
        <DatabaseForm
          onTest={handleTestConnection}
          onSave={handleSaveConnection}
          onSaveConfig={handleSaveConfig}
          loading={savingDb}
          testing={testingDb}
          configToLoad={selectedConfig}
        />
      );

      const savedConnectionsPanel = (
        <SavedConnectionsList
          onSelect={config => setSelectedConfig(config)}
          onRefresh={refreshConfigs}
        />
      );

      const pastePanel = <DataPasteCard onDataSourceSaved={triggerRefresh} />;

      return (
        <DataSourcePage
          activeTab={dataSourceTab}
          headerTitle={t("nav.datasource")}
          topIntro={
            <div className="mb-4 text-sm text-muted-foreground space-y-1">
              <div>{t("page.datasource.intro1")}</div>
              <div>{t("page.datasource.intro2")}</div>
            </div>
          }
          tabs={[
            { id: "upload", label: t("page.datasource.tabUpload") },
            { id: "database", label: t("page.datasource.tabDb") },
            { id: "paste", label: t("page.datasource.tabPaste") }
          ]}
          uploadPanel={uploadPanel}
          databasePanel={databasePanel}
          savedConnectionsPanel={savedConnectionsPanel}
          pastePanel={pastePanel}
          savedConnectionsTabs={["database"]}
        />
      );
    }

    if (currentTab === "unifiedquery") {
      return (
        <div className="p-6 space-y-6">
          <div className="bg-surface border border-border rounded-xl p-5 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">
                {t("nav.unifiedquery")}
              </h2>
              <div className="text-sm text-muted-foreground space-y-1">
                <div>{t("page.unifiedquery.intro1")}</div>
                <div>{t("page.unifiedquery.intro2")}</div>
                <div>{t("page.unifiedquery.intro3")}</div>
                <div>{t("page.unifiedquery.intro4")}</div>
                <div>{t("page.unifiedquery.intro5")}</div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-surface border border-border rounded-xl p-5 shadow-sm">
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
            </div>

            {queryResults.data && (
              <div className="bg-surface border border-border rounded-xl p-5 shadow-sm">
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

  const dataSourceHeaderTabs = [
    { id: "database", label: t("page.datasource.tabDb"), icon: Server },
    { id: "upload", label: t("page.datasource.tabUpload"), icon: Upload },
    { id: "paste", label: t("page.datasource.tabPaste"), icon: ClipboardEdit }
  ];

  const headerNode =
    currentTab === "datasource" ? (
      <Header
        titleNode={
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-semibold text-foreground tracking-tight">
              {t("page.datasource.manage.title")}
            </h1>
            <DataSourceTabs
              value={dataSourceTab}
              onChange={setDataSourceTab}
              tabs={dataSourceHeaderTabs}
            />
          </div>
        }
      >
        <button
          type="button"
          onClick={() => setIsDarkMode(prev => !prev)}
          className="hidden lg:inline-flex p-2 rounded-md text-muted-foreground hover:bg-muted transition-colors"
        >
          <Sun className="h-4 w-4" />
        </button>
      </Header>
    ) : (
      <Header title={t(tabTitles[currentTab]) || "Duck Query"}>
        <div className="flex items-center gap-2 lg:hidden">
          <MobileActionButton
            icon={isDarkMode ? Sun : Moon}
            label={
              isDarkMode ? t("actions.toggleLight") : t("actions.toggleDark")
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
      </Header>
    );

  return (
    <div className="dq-new-theme min-h-screen">
      <PageShell
        sidebar={
          <Sidebar
            navItems={[
              { id: "datasource", label: t("nav.datasource"), icon: Database },
              {
                id: "unifiedquery",
                label: t("nav.unifiedquery"),
                icon: LayoutGrid
              },
              {
                id: "tablemanagement",
                label: t("nav.tablemanagement"),
                icon: Table
              },
              { id: "asynctasks", label: t("nav.asynctasks"), icon: ListTodo },
              { id: "settings", label: t("nav.settings"), icon: Settings }
            ]}
            activeId={currentTab}
            onSelect={setCurrentTab}
            isDarkMode={isDarkMode}
            onToggleTheme={() => setIsDarkMode(prev => !prev)}
            locale={locale}
            onLocaleChange={toggleLocale}
            onOpenGithub={openGithub}
            onShowWelcome={() => {
              setShowWelcome(true);
              const welcomeShownKey = "duck-query-welcome-shown";
              localStorage.setItem(welcomeShownKey, new Date().toISOString());
            }}
            onSwitchLegacy={() => {
              localStorage.removeItem("dq-use-new-layout");
              window.location.href = window.location.pathname;
            }}
            logoLight={LogoLight}
            logoDark={LogoDark}
          />
        }
        header={headerNode}
      >
        {renderContent()}
      </PageShell>
    </div>
  );
};

const DuckQueryApp = () => (
  <ToastProvider>
    <ErrorBoundary>
      <DuckQueryAppInner />
    </ErrorBoundary>
  </ToastProvider>
);

export default DuckQueryApp;
