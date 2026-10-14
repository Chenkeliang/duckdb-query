import * as React from "react"
import { useTranslation } from "react-i18next"
import {
  Blocks,
  Clock,
  Code2,
  Database,
  GitMerge,
  History,
  Languages,
  Moon,
  PanelLeft,
  Play,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  Sun,
  Table,
  Upload,
  WrapText,
  CircleHelp,
} from "lucide-react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import { useDuckDBTables } from "@/hooks/useDuckDBTables"
import { formatShortcutLabel, useShortcuts } from "@/Settings/shortcuts"
import { useAiEnabled } from "@/hooks/useAiEnabled"
import { useGlobalHistory } from "@/Query/hooks/useGlobalHistory"
import { IS_DEMO } from "@/demo/isDemo"

/** Actions the palette can request; App maps them onto navigation, buses and toggles. */
export type CommandAction =
  | { type: "navigate"; tab: "queryworkbench" | "datasource" | "extensions" | "settings" }
  | { type: "workbench"; command: "run" | "runAsync" | "format" | "newSqlTab" | "newJoinTab" | "toggleExplorer" }
  | { type: "insertTable"; name: string }
  | { type: "loadSql"; sql: string }
  | { type: "addData" }
  | { type: "connectDatabase" }
  | { type: "aiAssistant" }
  | { type: "asyncTasks" }
  | { type: "refresh" }
  | { type: "toggleTheme" }
  | { type: "toggleLanguage" }
  | { type: "help" }

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAction: (action: CommandAction) => void
  isDarkMode: boolean
}

/** Rows shown for tables before the user types; typing searches all of them. */
const IDLE_TABLE_LIMIT = 5

/**
 * ⌘K command palette — the signature interaction of the graphite redesign.
 * Groups: recent runs → actions → go to → tables. Typing searches every group.
 */
export function CommandPalette({ open, onOpenChange, onAction, isDarkMode }: CommandPaletteProps) {
  const { t, i18n } = useTranslation("common")
  const { tables } = useDuckDBTables()
  const { getShortcutForAction } = useShortcuts()
  const aiEnabled = useAiEnabled()
  const { history } = useGlobalHistory()
  const [search, setSearch] = React.useState("")

  React.useEffect(() => {
    if (!open) setSearch("")
  }, [open])

  const keyOf = (actionId: string) => formatShortcutLabel(getShortcutForAction(actionId))
  const isZh = i18n.language?.startsWith("zh")
  const recent = history.filter((h) => h.type === "sql").slice(0, 3)
  const visibleTables = search ? tables : tables.slice(0, IDLE_TABLE_LIMIT)

  const run = (action: CommandAction) => {
    onOpenChange(false)
    onAction(action)
  }

  const item = (
    value: string,
    icon: React.ReactNode,
    label: React.ReactNode,
    action: CommandAction,
    shortcut?: string,
  ) => (
    <CommandItem key={value} value={value} keywords={typeof label === "string" ? [label] : undefined} onSelect={() => run(action)}>
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut ? <CommandShortcut>{shortcut}</CommandShortcut> : null}
    </CommandItem>
  )

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        value={search}
        onValueChange={setSearch}
        placeholder={t("command.placeholder", "搜索操作、表或最近的查询…")}
      />
      <CommandList>
        <CommandEmpty>{t("command.noResults", "没有匹配项")}</CommandEmpty>

        {recent.length > 0 && (
          <CommandGroup heading={t("command.groupRecent", "最近运行")}>
            {recent.map((h) =>
              item(
                `recent ${h.id} ${h.sql}`,
                <History />,
                <span className="font-mono text-xs">{h.sql.replace(/\s+/g, " ").trim()}</span>,
                { type: "loadSql", sql: h.sql },
              ),
            )}
          </CommandGroup>
        )}

        <CommandGroup heading={t("command.groupActions", "操作")}>
          {item("run execute query", <Play />, t("command.run", "执行当前查询"), { type: "workbench", command: "run" }, formatShortcutLabel("Cmd+Enter"))}
          {!IS_DEMO &&
            item("async run", <Clock />, t("command.runAsync", "异步执行当前查询"), { type: "workbench", command: "runAsync" }, formatShortcutLabel("Cmd+Shift+Enter"))}
          {item("format sql", <WrapText />, t("command.format", "格式化 SQL"), { type: "workbench", command: "format" })}
          {item("new sql tab", <Plus />, t("command.newSqlTab", "新建 SQL 标签"), { type: "workbench", command: "newSqlTab" })}
          {item("new join tab", <GitMerge />, t("command.newJoinTab", "新建 JOIN 查询"), { type: "workbench", command: "newJoinTab" })}
          {item("add data upload import file", <Upload />, t("command.addData", "添加数据"), { type: "addData" }, keyOf("uploadFile"))}
          {!IS_DEMO &&
            item("connect database mysql postgres", <Database />, t("command.connectDatabase", "连接数据库"), { type: "connectDatabase" })}
          {aiEnabled &&
            item("ai assistant chat", <Sparkles />, t("command.aiAssistant", "打开 AI 助手"), { type: "aiAssistant" }, keyOf("toggleAiPanel"))}
          {item("toggle explorer sidebar", <PanelLeft />, t("shortcuts.toggleExplorer", "显示 / 隐藏数据源面板"), { type: "workbench", command: "toggleExplorer" }, keyOf("toggleExplorer"))}
          {!IS_DEMO &&
            item("async tasks", <Clock />, t("command.asyncTasks", "查看异步任务"), { type: "asyncTasks" })}
          {item("refresh data sources", <RefreshCw />, t("command.refresh", "刷新数据源"), { type: "refresh" }, keyOf("refreshData"))}
          {item(
            "toggle theme dark light",
            isDarkMode ? <Sun /> : <Moon />,
            isDarkMode ? t("actions.toggleLight", "切换到浅色") : t("actions.toggleDark", "切换到暗色"),
            { type: "toggleTheme" },
            keyOf("toggleTheme"),
          )}
          {item("language english chinese", <Languages />, isZh ? "Switch to English" : "切换到中文", { type: "toggleLanguage" }, keyOf("toggleLanguage"))}
        </CommandGroup>

        <CommandGroup heading={t("command.groupGoto", "跳转")}>
          {item("goto workbench query", <Code2 />, t("nav.queryworkbench"), { type: "navigate", tab: "queryworkbench" }, keyOf("navigateQueryWorkbench"))}
          {item("goto data sources", <Database />, t("nav.datasource"), { type: "navigate", tab: "datasource" }, keyOf("navigateDataSource"))}
          {!IS_DEMO && item("goto extensions", <Blocks />, t("nav.extensions"), { type: "navigate", tab: "extensions" })}
          {item("goto settings", <Settings />, t("nav.settings"), { type: "navigate", tab: "settings" })}
          {item("help github docs", <CircleHelp />, t("command.help", "帮助与文档（GitHub）"), { type: "help" })}
        </CommandGroup>

        {visibleTables.length > 0 && (
          <CommandGroup heading={t("command.groupTables", "表")}>
            {visibleTables.map((table) =>
              item(
                `table ${table.name}`,
                <Table />,
                <span className="font-mono text-xs">{table.name}</span>,
                { type: "insertTable", name: table.name },
              ),
            )}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
