import React, { Suspense, lazy, useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import useDuckQuery from "./hooks/useDuckQuery";
import {
  Database,
  Server,
  Upload,
  ClipboardEdit,
  Settings,
  Code2,
  Search,
  Clock
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

import DataPasteCard from "./new/DataSource/DataPasteCard";
import QueryWorkbenchPage from "./new/QueryWorkbenchPage";
import { CommandPalette } from "./new/components/CommandPalette";
import { ShortcutProvider, useKeyboardShortcuts } from "./new/Settings/shortcuts";

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
  queryworkbench: "nav.queryworkbench",
  settings: "nav.settings"
};

const DuckQueryAppInner = () => {
  const { state, actions } = useDuckQuery();
  const { t, i18n } = useTranslation("common");
  const locale = i18n.language || "zh";
  const [isMobile, setIsMobile] = useState(false);
  const [dataSourceTab, setDataSourceTab] = useState("upload");
  const [queryWorkbenchTab, setQueryWorkbenchTab] = useState("query");
  const [savingDb, setSavingDb] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [refreshConfigs, setRefreshConfigs] = useState(0);
  const [testingDb, setTestingDb] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("dq-sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });

  // 保存折叠状态到 localStorage
  const handleSidebarCollapsedChange = useCallback((collapsed) => {
    setSidebarCollapsed(collapsed);
    try {
      localStorage.setItem("dq-sidebar-collapsed", String(collapsed));
    } catch {
      // ignore
    }
  }, []);

  const {
    showWelcome,
    isDarkMode,
    currentTab,
    previewQuery,
    githubStars
  } = state;

  const {
    setShowWelcome,
    setIsDarkMode,
    setCurrentTab,
    setPreviewQuery,
    triggerRefresh,
    handleDatabaseConnect,
    handleDatabaseSaveConfig,
    handleCloseWelcome
  } = actions;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const allowedTabs = ["datasource", "queryworkbench", "settings"];
    if (!allowedTabs.includes(currentTab)) {
      setCurrentTab("queryworkbench");
    }
  }, [currentTab, setCurrentTab]);

  // 国际化切换 - 必须在 useEffect 之前定义
  const toggleLocale = useCallback(() => {
    const next = locale.startsWith("zh") ? "en" : "zh";
    i18n.changeLanguage(next);
    try {
      localStorage.setItem("dq-locale", next);
    } catch {
      // ignore
    }
  }, [locale, i18n]);

  // Global keyboard shortcuts - using customizable shortcuts from context
  useKeyboardShortcuts({
    openCommandPalette: () => setCommandPaletteOpen(true),
    navigateDataSource: () => setCurrentTab('datasource'),
    navigateQueryWorkbench: () => setCurrentTab('queryworkbench'),
    refreshData: () => {
      triggerRefresh();
      toast.success(t('actions.refreshSuccess', 'Refreshed'));
    },
    uploadFile: () => {
      setCurrentTab('datasource');
      setDataSourceTab('upload');
    },
    toggleTheme: () => setIsDarkMode(!isDarkMode),
    toggleLanguage: toggleLocale,
  });

  // Command Palette handlers
  const handleCommandNavigate = (path) => {
    setCurrentTab(path);
  };

  const handleCommandAction = (action, params) => {
    switch (action) {
      case 'selectTable':
        // Handle table selection
        console.log('Select table:', params);
        break;
      case 'upload':
        setCurrentTab('datasource');
        setDataSourceTab('upload');
        break;
      case 'export':
        // Handle export
        toast.info(t('common.comingSoon', 'Coming soon'));
        break;
      case 'refresh':
        triggerRefresh();
        toast.success(t('actions.refreshSuccess', 'Refreshed'));
        break;
      case 'toggleTheme':
        setIsDarkMode(!isDarkMode);
        break;
      case 'toggleLanguage':
        toggleLocale();
        break;
      case 'settings':
        toast.info(t('common.comingSoon', 'Coming soon'));
        break;
      case 'help':
        window.open('https://github.com/chenkeliang/duckdb-query', '_blank');
        break;
      default:
        console.log('Unknown action:', action, params);
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
      const uploadPanel = (
        <UploadPanel
          onDataSourceSaved={triggerRefresh}
        />
      );

      const handleTestConnection = async params => {
        try {
          setTestingDb(true);
          const { testDatabaseConnection, refreshDatabaseConnection } = await import(
            "./services/apiClient"
          );
          
          let result;
          // 已保存连接且未输入新密码：使用 refresh 端点（后端使用存量密码测试）
          if (params?.useStoredPassword && params.id) {
            result = await refreshDatabaseConnection(params.id);
          } else {
            // 用户输入了新密码，使用 test 端点
            result = await testDatabaseConnection({
              type: params.type,
              params: params.params
            });
	          }
	          
	          // 统一读取测试结果（apiClient 已归一化为 { success, message }）
	          const testSuccess = result?.success === true;
	          const testMessage = result?.message;
	          
	          if (testSuccess) {
	            toast.success(
	              testMessage || t("page.datasource.list.testSuccess")
            );
          } else {
            toast.error(testMessage || t("page.datasource.list.testFail"));
          }
        } catch (err) {
          toast.error(err?.message || t("page.datasource.list.testFail"));
        } finally {
          setTestingDb(false);
        }
      };

      const handleSaveConnection = async params => {
        try {
          setSavingDb(true);
          const response = await handleDatabaseConnect(params);
          if (response?.success) {
            toast.success(
              response?.message || t("page.datasource.manage.saveSuccess")
            );
            setRefreshConfigs(prev => prev + 1);
          } else {
            toast.error(
              response?.message || t("page.datasource.list.errorUnknown")
            );
          }
        } catch (err) {
          toast.error(err?.message || t("page.datasource.list.errorUnknown"));
        } finally {
          setSavingDb(false);
        }
      };

      const handleSaveConfig = async params => {
        try {
          setSavingDb(true);
          const response = await handleDatabaseSaveConfig(params);
          if (response?.success) {
            toast.success(
              response?.message || t("page.datasource.manage.saveSuccess")
            );
            setRefreshConfigs(prev => prev + 1);
          } else {
            toast.error(
              response?.message || t("page.datasource.list.errorUnknown")
            );
          }
        } catch (err) {
          toast.error(err?.message || t("page.datasource.list.errorUnknown"));
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

      const pastePanel = (
        <DataPasteCard
          onDataSourceSaved={triggerRefresh}
        />
      );

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

    if (currentTab === "queryworkbench") {
      return (
        <QueryWorkbenchPage
          activeTab={queryWorkbenchTab}
          onTabChange={setQueryWorkbenchTab}
          previewSQL={previewQuery}
          onPreviewSQL={(sql) => {
            setPreviewQuery(sql);
            setQueryWorkbenchTab("query");
          }}
        />
      );
    }

    if (currentTab === "settings") {
      const SettingsPage = React.lazy(() => import('./new/Settings/SettingsPage').then(m => ({ default: m.SettingsPage })));
      return (
        <React.Suspense fallback={<LazyFallback />}>
          <SettingsPage />
        </React.Suspense>
      );
    }

    return null;
  };

  const dataSourceHeaderTabs = [
    { id: "database", label: t("page.datasource.tabDb"), icon: Server },
    { id: "upload", label: t("page.datasource.tabUpload"), icon: Upload },
    { id: "paste", label: t("page.datasource.tabPaste"), icon: ClipboardEdit }
  ];

  // 通用 Header props
  const headerGlobalProps = {
    isDarkMode,
    onToggleTheme: () => setIsDarkMode(prev => !prev),
    locale,
    onLocaleChange: toggleLocale,
    onOpenGithub: openGithub
  };

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
        {...headerGlobalProps}
      />
    ) : currentTab === "queryworkbench" ? (
      <Header
        titleNode={
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-semibold text-foreground tracking-tight">
              {t("nav.queryworkbench")}
            </h1>
            <DataSourceTabs
              value={queryWorkbenchTab}
              onChange={setQueryWorkbenchTab}
              tabs={[
                { id: "query", label: t("workspace.queryMode"), icon: Search },
                { id: "tasks", label: t("nav.asynctasks"), icon: Clock }
              ]}
            />
          </div>
        }
        {...headerGlobalProps}
      />
    ) : (
      <Header 
        title={t(tabTitles[currentTab]) || "Duck Query"}
        {...headerGlobalProps}
      />
    );

  return (
    <div className="dq-new-theme min-h-screen">
      <PageShell
        sidebarCollapsed={sidebarCollapsed}
        sidebar={
          <Sidebar
            navItems={[
              { id: "datasource", label: t("nav.datasource"), icon: Database },
              {
                id: "queryworkbench",
                label: t("nav.queryworkbench"),
                icon: Code2
              },
              { id: "settings", label: t("nav.settings"), icon: Settings }
            ]}
            activeId={currentTab}
            onSelect={setCurrentTab}
            isDarkMode={isDarkMode}
            logoLight={LogoLight}
            logoDark={LogoDark}
            collapsed={sidebarCollapsed}
            onCollapsedChange={handleSidebarCollapsedChange}
          />
        }
        header={headerNode}
      >
        {renderContent()}
      </PageShell>

      {/* Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onNavigate={handleCommandNavigate}
        onAction={handleCommandAction}
      />
    </div>
  );
};

const DuckQueryApp = () => (
  <ErrorBoundary>
    <ShortcutProvider>
      <DuckQueryAppInner />
    </ShortcutProvider>
  </ErrorBoundary>
);

export default DuckQueryApp;
