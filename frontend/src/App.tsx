import React, {
  lazy,
  useEffect,
  useState,
  useCallback,
  Component,
  ReactNode,
  ErrorInfo
} from "react";
import { useAppShell } from "./hooks/useAppShell";
import type { DatabaseConnectParams } from "./hooks/useAppActions";
import {
  showSuccessToast,
  showErrorToast,
  showResponseToast
} from "./utils/toastHelpers";
import { toast } from "sonner";
import useAppConfig from "./hooks/useAppConfig";
import {
  Database,
  Settings,
  Code2,
  Blocks,
  MoreHorizontal,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import PageShell from "./Layout/PageShell";
import AppRail, { type RailItem } from "./Layout/AppRail";
import StatusBar from "./Layout/StatusBar";
import DataSourcePage from "./DataSource/DataSourcePage";
import { IS_DEMO } from "./demo/isDemo";
import { DemoBanner } from "./demo/DemoBanner";
import { DemoNotice } from "./demo/DemoNotice";
import { DemoUpload } from "./demo/DemoUpload";
import DatabaseForm, { type ConnectionTestResult } from "./DataSource/DatabaseForm";
import type { DataSourceMethod } from './DataSource/DataSourceActions';
import type { DatabaseConnection } from './hooks/useDatabaseConnections';
import UploadPanel from "./DataSource/UploadPanel";
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import SavedConnectionsList from "./DataSource/SavedConnectionsList";

import DataPasteCard from "./DataSource/DataPasteCard";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from './components/ui/sheet';
import QueryWorkbenchPage from "./QueryWorkbenchPage";
import { CommandPalette, type CommandAction } from "./components/CommandPalette";
import { MajorVersionNotice } from "./components/MajorVersionNotice";
import { ShortcutProvider, useKeyboardShortcuts } from "./Settings/shortcuts";
import type { SettingsSectionId } from "./Settings/SettingsPage";
import { useAsyncTaskMonitor } from "./hooks/useAsyncTaskMonitor";
import { useAiStatus } from "./hooks/useAiStatus";
import { agentChatBus } from "./Query/SQLQuery/ai/agentChatBus";
import { queueWorkbenchCommand } from "./Query/workbenchCommands";

import Logo from "./assets/duckq-logo.svg";
import { isTauri, openExternal } from "./desktop/openExternal";
import { generateExternalTableReference } from '@/utils/sqlUtils';
import { testDatabaseConnection } from "@/api";
const WelcomePage = lazy(() => import("./WelcomePage"));

// Types
type TabId = "datasource" | "queryworkbench" | "extensions" | "settings";
type DataSourceTabId = "upload" | "database" | "paste";

const GITHUB_URL = "https://github.com/chenkeliang/duckdb-query";

// Lazy Fallback Component
const LazyFallback: React.FC = () => {
  const { t } = useTranslation("common");
  return <div className="p-6 text-sm text-muted-foreground">{t("actions.loading")}</div>;
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
      // i18n 未必可用（边界可能接住 i18n 自身的错误），保留中英双语兜底文案
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center text-foreground">
          <div className="font-semibold text-error">页面出错了 · Something went wrong</div>
          <div className="max-w-xl font-mono text-xs text-muted-foreground">{this.state.error?.message}</div>
          <button
            className="mt-2 h-8 rounded-md bg-foreground px-3 text-sm font-medium text-background hover:opacity-90"
            onClick={() => window.location.reload()}
          >
            重新加载 · Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const ExtensionsPage = React.lazy(() =>
  import("./Extensions/ExtensionsPage").then(m => ({ default: m.ExtensionsPage }))
);

const SettingsPage = React.lazy(() =>
  import("./Settings/SettingsPage").then(m => ({ default: m.SettingsPage }))
);

const AppInner: React.FC = () => {
  const { state, actions } = useAppShell();
  useAppConfig();

  const { t, i18n } = useTranslation("common");
  const locale = i18n.language || "zh";
  const [addDataOpen, setAddDataOpen] = useState(false);
  const [uploadMethod, setUploadMethod] = useState<"local" | "url" | "server">("local");
  const [clipboardData, setClipboardData] = useState('');
  const [previewSequence, setPreviewSequence] = useState(0);
  const [dataSourceTab, setDataSourceTab] = useState<DataSourceTabId>("upload");
  const [savingDb, setSavingDb] = useState<boolean>(false);
  const [
    selectedConfig,
    setSelectedConfig
  ] = useState<(DatabaseConnectParams & { requiresPassword?: boolean }) | null>(null);
  const [testingDb, setTestingDb] = useState<boolean>(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const [asyncTasksOpen, setAsyncTasksOpen] = useState<boolean>(false);
  const [settingsFocus, setSettingsFocus] = useState<{ section: SettingsSectionId; token: number } | null>(null);

  const { showWelcome, isDarkMode, currentTab, previewQuery } = state;

  const {
    setDarkMode,
    setCurrentTab,
    setPreviewQuery,
    refreshData,
    connectDatabase,
    closeWelcome
  } = actions;

  // 异步任务监控挂在应用级：任何页面都能收到完成提示，状态栏显示运行数
  const { runningCount: asyncRunning, totalCount: asyncTotal } = useAsyncTaskMonitor();
  const aiStatus = useAiStatus("data_qa");
  const requestPreview = useCallback((sql: string) => {
    setPreviewQuery(sql);
    setPreviewSequence((sequence) => sequence + 1);
  }, [setPreviewQuery]);

  useEffect(() => {
    // "ai" 是旧版独立页（已并入设置），其余未知值回落到工作台
    if ((currentTab as string) === "ai") {
      setCurrentTab("settings");
      return;
    }
    const allowedTabs: TabId[] = ["datasource", "queryworkbench", "extensions", "settings"];
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

  const openSettings = useCallback(
    (section?: SettingsSectionId) => {
      setCurrentTab("settings");
      if (section) setSettingsFocus({ section, token: Date.now() });
    },
    [setCurrentTab]
  );

  /** AI 助手：未配置模型时去设置页配置，否则在工作台右侧打开 / 关闭面板。 */
  const toggleAiAssistant = useCallback(
    (forceOpen?: boolean) => {
      if (!aiStatus.configured) {
        toast.info(t("settings.aiNeedsConfig", "先配置 AI 模型，才能使用 AI 助手"));
        openSettings("ai");
        return;
      }
      if (currentTab !== "queryworkbench") {
        setCurrentTab("queryworkbench");
        agentChatBus.setOpen(true);
        return;
      }
      agentChatBus.setOpen(forceOpen ?? !agentChatBus.getState().open);
    },
    [aiStatus.configured, currentTab, openSettings, setCurrentTab, t]
  );

  const openAddData = useCallback(
    (method: DataSourceMethod = "local", text = '') => {
      setSelectedConfig(null);
      setDataSourceTab(method === 'database' || method === 'paste' ? method : 'upload');
      if (method === 'local' || method === 'url' || method === 'server') setUploadMethod(method);
      setClipboardData(text);
      setAddDataOpen(true);
    },
    []
  );

  const openEditConnection = (connection: DatabaseConnection) => {
    setSelectedConfig({ id: connection.id, type: connection.type, name: connection.name, params: connection.params, requiresPassword: connection.requiresPassword });
    setDataSourceTab('database');
    setAddDataOpen(true);
  };

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest('input,textarea,[contenteditable="true"],[role="dialog"]')) return;
      const text = event.clipboardData?.getData('text/plain') || '';
      if (!/[\t,]/.test(text) || !/[\r\n]/.test(text.trim())) return;
      event.preventDefault();
      openAddData('paste', text);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [openAddData]);

  const refreshAll = useCallback(() => {
    refreshData();
    showSuccessToast(t, "DATASOURCES_REFRESHED", t("actions.refreshSuccess", "Refreshed"));
  }, [refreshData, t]);

  const runOnWorkbench = useCallback(
    (fn: () => void) => {
      if (currentTab !== "queryworkbench") setCurrentTab("queryworkbench");
      fn();
    },
    [currentTab, setCurrentTab]
  );

  useKeyboardShortcuts({
    openCommandPalette: () => setCommandPaletteOpen(true),
    navigateDataSource: () => setCurrentTab("datasource"),
    navigateQueryWorkbench: () => setCurrentTab("queryworkbench"),
    refreshData: refreshAll,
    refreshDataSources: () => {
      refreshData();
      showSuccessToast(t, "DATASOURCES_REFRESHED", t("dataSource.refreshed", "Data sources refreshed"));
    },
    uploadFile: () => openAddData("local"),
    toggleTheme: () => setDarkMode(!isDarkMode),
    toggleLanguage: toggleLocale,
    toggleAiPanel: () => toggleAiAssistant(),
    toggleExplorer: () => runOnWorkbench(() => queueWorkbenchCommand("toggleExplorer"))
  });

  const handleCommandAction = (action: CommandAction) => {
    switch (action.type) {
      case "navigate":
        setCurrentTab(action.tab);
        break;
      case "workbench":
        runOnWorkbench(() => {
          if (action.command === "newSqlTab") queueWorkbenchCommand("newTab", "sql");
          else if (action.command === "newJoinTab") queueWorkbenchCommand("newTab", "join");
          else queueWorkbenchCommand(action.command);
        });
        break;
      case "insertTable":
        runOnWorkbench(() => queueWorkbenchCommand("insertText", action.name));
        break;
      case "loadSql":
        runOnWorkbench(() => queueWorkbenchCommand("loadSql", action.sql));
        break;
      case "addData":
        openAddData("local");
        break;
      case "connectDatabase":
        if (IS_DEMO) setCurrentTab('datasource');
        else openAddData('database');
        break;
      case "aiAssistant":
        toggleAiAssistant(true);
        break;
      case "asyncTasks":
        runOnWorkbench(() => setAsyncTasksOpen(true));
        break;
      case "refresh":
        refreshAll();
        break;
      case "toggleTheme":
        setDarkMode(!isDarkMode);
        break;
      case "toggleLanguage":
        toggleLocale();
        break;
      case "help":
        openExternal(GITHUB_URL);
        break;
    }
  };

  const openGithub = () => openExternal(GITHUB_URL);

  if (showWelcome) {
    return <WelcomePage onStartUsing={closeWelcome} />;
  }

  const handleTestConnection = async (params: DatabaseConnectParams): Promise<ConnectionTestResult> => {
    try {
      setTestingDb(true);
      // Unified test flow: pass ID + Params. Backend handles stored password merging.
      const result: { success?: boolean; message?: string; messageCode?: string } | undefined =
        await testDatabaseConnection({
          id: params.id, // Now supported by type
          type: params.type as "mysql" | "postgresql" | "sqlite" | "duckdb",
          name: params.id || "test-connection",
          params: params.params as Record<string, unknown>,
          useStoredPassword: params.useStoredPassword
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
      return { success: testSuccess, message: testSuccess ? t('page.datasource.list.testSuccess') : testMessage || t('page.datasource.list.testFail') };
    } catch (err) {
      showErrorToast(t, err as Error, t("page.datasource.list.testFail"));
      return { success: false, message: err instanceof Error ? err.message : t('page.datasource.list.testFail') };
    } finally {
      setTestingDb(false);
    }
  };

  const handleSaveConnection = async (params: DatabaseConnectParams) => {
    try {
      setSavingDb(true);
      const response = await connectDatabase(params);
      if (response?.success) {
        setAddDataOpen(false);
        const connectionId = params.id;
        if (!selectedConfig && connectionId) runOnWorkbench(() => queueWorkbenchCommand('revealConnection', connectionId));
        showResponseToast(t, response, {
          successFallback: t("page.datasource.manage.saveSuccess")
        });
      } else {
        showResponseToast(t, response, {
          errorFallback: t("page.datasource.list.errorUnknown")
        });
      }
    } catch (err) {
      showErrorToast(t, err as Error, t("page.datasource.list.errorUnknown"));
    } finally {
      setSavingDb(false);
    }
  };

  const handleImportedData = ({ id }: { id: string }) => {
    setAddDataOpen(false);
    if (id) runOnWorkbench(() => queueWorkbenchCommand('revealTable', id));
  };

  const renderContent = (): ReactNode => {
    // Demo:数据源 → 浏览器内文件导入(可用)+ 连库/Excel 自托管引导(正常构建此分支被剥离)
    if (IS_DEMO && currentTab === "datasource") {
      return (
        <div className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-xl">
            <h2 className="mb-1 text-lg font-semibold text-foreground">
              {t("demo.importTitle", "导入数据(浏览器内)")}
            </h2>
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              {t(
                "demo.importDesc",
                "拖文件进来即在你浏览器内解析建表、可直接查询,不上传服务器。连 MySQL / PostgreSQL 或读 Excel 需自托管版。",
              )}
            </p>
            <DemoUpload onLoaded={() => setCurrentTab("queryworkbench")} />
            <a
              href="https://github.com/Chenkeliang/duckdb-query"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-xs font-medium text-foreground underline underline-offset-4 hover:opacity-80"
            >
              {t("demo.selfHostDb", "连数据库 / 读 Excel?自托管解锁 →")}
            </a>
          </div>
        </div>
      );
    }
    // Demo:扩展管理需要后端联网安装,浏览器内 Demo 无后端,复用 AI 的自托管引导文案
    if (IS_DEMO && currentTab === "extensions") {
      return <DemoNotice variant="ai" />;
    }

    if (currentTab === "datasource") {
      return <DataSourcePage
        onAddData={openAddData}
        onBackToWorkbench={() => setCurrentTab('queryworkbench')}
        onQueryTable={(name) => {
          requestPreview(`SELECT * FROM ${generateExternalTableReference({ name, source: 'duckdb' }).qualifiedName}`);
          setCurrentTab('queryworkbench');
        }}
        savedConnectionsPanel={<SavedConnectionsList
          overview
          onNew={() => { setSelectedConfig(null); openAddData('database'); }}
          onSelect={openEditConnection}
          onBrowse={(connection) => runOnWorkbench(() => queueWorkbenchCommand('revealConnection', connection.id))}
        />}
      />;
    }

    if (currentTab === "extensions") {
      return (
        <React.Suspense fallback={<LazyFallback />}>
          {/* h-full：main 是 flex 列，页面自己负责滚动 */}
          <div className="h-full overflow-auto px-4 pb-16 pt-7 md:px-8">
            <div className="mx-auto max-w-6xl">
              <ExtensionsPage />
            </div>
          </div>
        </React.Suspense>
      );
    }

    if (currentTab === "settings") {
      return (
        <React.Suspense fallback={<LazyFallback />}>
          <SettingsPage focusSection={settingsFocus?.section} focusToken={settingsFocus?.token} />
        </React.Suspense>
      );
    }

    return null;
  };

  const railItems: RailItem[] = [
    {
      id: "queryworkbench",
      label: t("nav.queryworkbench"),
      icon: Code2,
      badge: asyncRunning > 0,
      active: currentTab === "queryworkbench"
    },
    { id: "datasource", label: t("nav.datasource"), icon: Database },
    ...(IS_DEMO ? [] : [{ id: "extensions", label: t("nav.extensions"), icon: Blocks }])
  ];

  const railFooter: RailItem[] = [
    { id: "settings", label: t("nav.settings"), icon: Settings },
    { id: "commands", label: t("shortcuts.openCommandPalette"), icon: MoreHorizontal, mobileOnly: true, onClick: () => setCommandPaletteOpen(true) },
  ];

  return (
    <div className="h-screen overflow-hidden">
      <PageShell
        rail={
          <AppRail
            logo={Logo}
            items={railItems}
            footerItems={railFooter}
            activeId={currentTab}
            onSelect={(id) => setCurrentTab(id)}
          />
        }
        statusBar={
          <StatusBar
            isDarkMode={isDarkMode}
            onToggleTheme={() => setDarkMode((prev: boolean) => !prev)}
            locale={locale}
            onToggleLocale={toggleLocale}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            onOpenGithub={openGithub}
            onOpenDataSources={() => setCurrentTab("datasource")}
            asyncRunning={asyncRunning}
            onOpenAsyncTasks={() => runOnWorkbench(() => setAsyncTasksOpen(true))}
          />
        }
      >
        <MajorVersionNotice />
        <DemoBanner />
        <div className="min-h-0 flex-1">
          <div className={currentTab === 'queryworkbench' ? 'h-full' : 'hidden'}>
            <QueryWorkbenchPage onAddData={openAddData} onEditConnection={openEditConnection} isActive={currentTab === 'queryworkbench'} previewSQL={previewQuery} previewNonce={previewSequence} asyncRunning={asyncRunning} asyncTotal={asyncTotal} onOpenAiSettings={() => openSettings('ai')} asyncTasksOpen={asyncTasksOpen} onAsyncTasksOpenChange={setAsyncTasksOpen} />
          </div>
          {currentTab !== 'queryworkbench' && renderContent()}
        </div>
      </PageShell>

      <Sheet open={addDataOpen} onOpenChange={setAddDataOpen}>
        <SheetContent className="flex w-full flex-col gap-4 overflow-auto sm:max-w-2xl" aria-describedby={undefined}>
          <SheetTitle>{t(dataSourceTab === 'database' ? (selectedConfig ? 'page.datasource.flow.editConnection' : 'page.datasource.list.newConnection') : 'page.datasource.flow.importData')}</SheetTitle>
          <SheetDescription>{dataSourceTab === 'database' ? t(selectedConfig ? 'page.datasource.flow.editHint' : 'page.datasource.flow.newHint', { name: selectedConfig?.name }) : t('page.datasource.flow.importHint')}</SheetDescription>
          {dataSourceTab !== 'database' && <Tabs value={dataSourceTab === 'paste' ? 'paste' : uploadMethod} onValueChange={(method) => {
            if (method === 'paste') setDataSourceTab('paste');
            else { setDataSourceTab('upload'); setUploadMethod(method as 'local' | 'url' | 'server'); }
          }}>
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
              <TabsTrigger value="local">{t('page.datasource.sourceLocal')}</TabsTrigger>
              <TabsTrigger value="paste">{t('page.datasource.tabPaste')}</TabsTrigger>
              {!IS_DEMO && <TabsTrigger value="url">{t('page.datasource.cardRemoteTitle')}</TabsTrigger>}
              {!IS_DEMO && !isTauri() && <TabsTrigger value="server">{t('page.datasource.cardServerTitle')}</TabsTrigger>}
            </TabsList>
          </Tabs>}
          {dataSourceTab === 'database' && !IS_DEMO ? <DatabaseForm onTest={handleTestConnection} onSave={handleSaveConnection} onCancel={() => setAddDataOpen(false)} loading={savingDb} testing={testingDb} configToLoad={selectedConfig} /> : dataSourceTab === 'paste' ? <DataPasteCard initialText={clipboardData} onDataSourceSaved={handleImportedData} /> : IS_DEMO ? <DemoUpload onLoaded={() => { setAddDataOpen(false); setCurrentTab('queryworkbench'); }} /> : <UploadPanel method={uploadMethod} onDataSourceSaved={handleImportedData} />}
        </SheetContent>
      </Sheet>
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onAction={handleCommandAction}
        isDarkMode={isDarkMode}
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
