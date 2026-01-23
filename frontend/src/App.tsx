import React, {
  lazy,
  useEffect,
  useState,
  useCallback,
  Component,
  ReactNode,
  ErrorInfo
} from "react";
import { toast } from "sonner";
import { extractMessage, extractMessageCode } from "@/api/client";
import { useAppShell } from "./hooks/useAppShell";
import {
  showSuccessToast,
  showErrorToast,
  showResponseToast
} from "./utils/toastHelpers";
import useAppConfig from "./hooks/useAppConfig";
import {
  Database,
  Server,
  Upload,
  ClipboardEdit,
  Settings,
  Code2,
  Search,
  Clock,
  LucideIcon
} from "lucide-react";
import { useTranslation } from "react-i18next";

import PageShell from "./Layout/PageShell";
import Sidebar from "./Layout/Sidebar";
import Header from "./Layout/Header";
import DataSourcePage from "./DataSource/DataSourcePage";
import DatabaseForm from "./DataSource/DatabaseForm";
import UploadPanel from "./DataSource/UploadPanel";
import DataSourceTabs from "./DataSource/DataSourceTabs";
import SavedConnectionsList from "./DataSource/SavedConnectionsList";

import DataPasteCard from "./DataSource/DataPasteCard";
import QueryWorkbenchPage from "./QueryWorkbenchPage";
import { CommandPalette } from "./components/CommandPalette";
import { ShortcutProvider, useKeyboardShortcuts } from "./Settings/shortcuts";

import Logo from "./assets/duckq-logo.svg";
const WelcomePage = lazy(() => import("./WelcomePage"));

// Types
type TabId = "datasource" | "queryworkbench" | "settings";
type DataSourceTabId = "upload" | "database" | "paste";
type QueryTabId = "query" | "tasks";

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface TabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
}

interface HeaderGlobalProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
  locale: string;
  onLocaleChange: () => void;
  onOpenGithub: () => void;
}

interface DatabaseConnectionParams {
  useStoredPassword?: boolean;
  id?: string;
  type?: string;
  params?: Record<string, unknown>;
}

// Lazy Fallback Component
const LazyFallback: React.FC = () => {
  const { t } = useTranslation("common");
  return (
    <div className="p-6 dq-text-tertiary text-sm">{t("actions.loading")}</div>
  );
};

// Error Boundary
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render(): ReactNode {
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

const tabTitles: Record<TabId, string> = {
  datasource: "nav.datasource",
  queryworkbench: "nav.queryworkbench",
  settings: "nav.settings"
};

const SettingsPage = React.lazy(() =>
  import("./Settings/SettingsPage").then(m => ({ default: m.SettingsPage }))
);

const AppInner: React.FC = () => {
  const { state, actions } = useAppShell();
  useAppConfig();

  const { t, i18n } = useTranslation("common");
  const locale = i18n.language || "zh";
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [dataSourceTab, setDataSourceTab] = useState<DataSourceTabId>("upload");
  const [queryWorkbenchTab, setQueryWorkbenchTab] = useState<QueryTabId>(
    "query"
  );
  const [savingDb, setSavingDb] = useState<boolean>(false);
  const [
    selectedConfig,
    setSelectedConfig
  ] = useState<DatabaseConnectionParams | null>(null);
  const [testingDb, setTestingDb] = useState<boolean>(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("dq-sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });

  const handleSidebarCollapsedChange = useCallback((collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    try {
      localStorage.setItem("dq-sidebar-collapsed", String(collapsed));
    } catch {
      // ignore
    }
  }, []);

  const { showWelcome, isDarkMode, currentTab, previewQuery } = state;

  const {
    setDarkMode,
    setCurrentTab,
    setPreviewQuery,
    refreshData,
    connectDatabase,
    saveDatabase,
    closeWelcome
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
    const allowedTabs: TabId[] = ["datasource", "queryworkbench", "settings"];
    if (!allowedTabs.includes(currentTab as TabId)) {
      setCurrentTab("queryworkbench");
    }
  }, [currentTab, setCurrentTab]);

  const toggleLocale = useCallback(() => {
    const next = locale.startsWith("zh") ? "en" : "zh";
    i18n.changeLanguage(next);
    try {
      localStorage.setItem("dq-locale", next);
    } catch {
      // ignore
    }
  }, [locale, i18n]);

  useKeyboardShortcuts({
    openCommandPalette: () => setCommandPaletteOpen(true),
    navigateDataSource: () => setCurrentTab("datasource"),
    navigateQueryWorkbench: () => setCurrentTab("queryworkbench"),
    refreshData: () => {
      refreshData();
      showSuccessToast(
        t,
        "DATASOURCES_REFRESHED",
        t("actions.refreshSuccess", "Refreshed")
      );
    },
    refreshDataSources: () => {
      refreshData();
      showSuccessToast(
        t,
        "DATASOURCES_REFRESHED",
        t("dataSource.refreshed", "Data sources refreshed")
      );
    },
    uploadFile: () => {
      setCurrentTab("datasource");
      setDataSourceTab("upload");
    },
    toggleTheme: () => setDarkMode(!isDarkMode),
    toggleLanguage: toggleLocale
  });

  const handleCommandNavigate = (path: string) => {
    setCurrentTab(path);
  };

  const handleCommandAction = (action: string, params?: unknown) => {
    switch (action) {
      case "selectTable":
        console.log("Select table:", params);
        break;
      case "upload":
        setCurrentTab("datasource");
        setDataSourceTab("upload");
        break;
      case "export":
        toast.info(t("common.comingSoon", "Coming soon"));
        break;
      case "refresh":
        refreshData();
        showSuccessToast(
          t,
          "DATASOURCES_REFRESHED",
          t("actions.refreshSuccess", "Refreshed")
        );
        break;
      case "toggleTheme":
        setDarkMode(!isDarkMode);
        break;
      case "toggleLanguage":
        toggleLocale();
        break;
      case "settings":
        toast.info(t("common.comingSoon", "Coming soon"));
        break;
      case "help":
        window.open("https://github.com/chenkeliang/duckdb-query", "_blank");
        break;
      default:
        console.log("Unknown action:", action, params);
    }
  };

  const openGithub = () =>
    window.open(
      "https://github.com/chenkeliang/duckdb-query",
      "_blank",
      "noopener,noreferrer"
    );

  if (showWelcome) {
    return <WelcomePage onStartUsing={closeWelcome} />;
  }

  const renderContent = (): ReactNode => {
    if (currentTab === "datasource") {
      const uploadPanel = <UploadPanel />;

      const handleTestConnection = async (params: DatabaseConnectionParams) => {
        try {
          setTestingDb(true);
          // [Fix] Removed refreshDatabaseConnection dynamic import and logic
          // Always use testDatabaseConnection which now supports ID-based password inheritance
          const { testDatabaseConnection } = await import("@/api");

          let result:
            | { success?: boolean; message?: string; messageCode?: string }
            | undefined;

          // Unified test flow: pass ID + Params. Backend handles stored password merging.
          result = await testDatabaseConnection({
            id: params.id, // Now supported by type
            type: params.type as "mysql" | "postgresql" | "sqlite",
            name: params.id || "test-connection",
            params: params.params as Record<string, unknown>
          });

          const testSuccess = result?.success === true;
          const testMessage = result?.message;
          const testMessageCode = result?.messageCode;

          if (testSuccess) {
            showSuccessToast(
              t,
              testMessageCode || "CONNECTION_TEST_SUCCESS",
              testMessage || t("page.datasource.list.testSuccess")
            );
          } else {
            showErrorToast(
              t,
              testMessageCode || "CONNECTION_TEST_FAILED",
              testMessage || t("page.datasource.list.testFail")
            );
          }
        } catch (err) {
          const error = err as any;
          const code =
            error?.code || error?.messageCode || "CONNECTION_TEST_FAILED";
          const message = error?.message || t("page.datasource.list.testFail");
          showErrorToast(t, code, message);
        } finally {
          setTestingDb(false);
        }
      };

      const handleSaveConnection = async (params: DatabaseConnectionParams) => {
        try {
          setSavingDb(true);
          const response = await connectDatabase(params);
          if (response?.success) {
            showResponseToast(t, response, {
              successFallback: t("page.datasource.manage.saveSuccess")
            });
          } else {
            showResponseToast(t, response, {
              errorFallback: t("page.datasource.list.errorUnknown")
            });
          }
        } catch (err) {
          const error = err as any;
          const code = error?.code || error?.messageCode || "OPERATION_FAILED";
          const message =
            error?.message || t("page.datasource.list.errorUnknown");
          showErrorToast(t, code, message);
        } finally {
          setSavingDb(false);
        }
      };

      const handleSaveConfig = async (params: DatabaseConnectionParams) => {
        try {
          setSavingDb(true);
          const response = await saveDatabase(params);
          if (response?.success) {
            showResponseToast(t, response, {
              successFallback: t("page.datasource.manage.saveSuccess")
            });
          } else {
            showResponseToast(t, response, {
              errorFallback: t("page.datasource.list.errorUnknown")
            });
          }
        } catch (err) {
          const error = err as any;
          const code = error?.code || error?.messageCode || "OPERATION_FAILED";
          const message =
            error?.message || t("page.datasource.list.errorUnknown");
          showErrorToast(t, code, message);
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
          onSelect={(config: DatabaseConnectionParams) =>
            setSelectedConfig(config)
          }
        />
      );

      const pastePanel = <DataPasteCard />;

      return (
        <DataSourcePage
          activeTab={dataSourceTab}
          headerTitle={t("nav.datasource")}
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
          onPreviewSQL={(sql: string) => {
            setPreviewQuery(sql);
            setQueryWorkbenchTab("query");
          }}
        />
      );
    }

    if (currentTab === "settings") {
      return (
        <React.Suspense fallback={<LazyFallback />}>
          <SettingsPage />
        </React.Suspense>
      );
    }

    return null;
  };

  const dataSourceHeaderTabs: TabItem[] = [
    { id: "database", label: t("page.datasource.tabDb"), icon: Server },
    { id: "upload", label: t("page.datasource.tabUpload"), icon: Upload },
    { id: "paste", label: t("page.datasource.tabPaste"), icon: ClipboardEdit }
  ];

  const headerGlobalProps: HeaderGlobalProps = {
    isDarkMode,
    onToggleTheme: () => setDarkMode((prev: boolean) => !prev),
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
        title={t(tabTitles[currentTab as TabId]) || "Duck Query"}
        {...headerGlobalProps}
      />
    );

  const navItems: NavItem[] = [
    { id: "datasource", label: t("nav.datasource"), icon: Database },
    { id: "queryworkbench", label: t("nav.queryworkbench"), icon: Code2 },
    { id: "settings", label: t("nav.settings"), icon: Settings }
  ];

  return (
    <div className="dq-new-theme h-screen overflow-hidden">
      <PageShell
        sidebarCollapsed={sidebarCollapsed}
        sidebar={
          <Sidebar
            navItems={navItems}
            activeId={currentTab}
            onSelect={setCurrentTab}
            isDarkMode={isDarkMode}
            logoLight={Logo}
            logoDark={Logo}
            collapsed={sidebarCollapsed}
            onCollapsedChange={handleSidebarCollapsedChange}
          />
        }
        header={headerNode}
      >
        {renderContent()}
      </PageShell>

      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onNavigate={handleCommandNavigate}
        onAction={handleCommandAction}
      />
    </div>
  );
};

const App: React.FC = () => (
  <ErrorBoundary>
    <ShortcutProvider>
      <AppInner />
    </ShortcutProvider>
  </ErrorBoundary>
);

export default App;
