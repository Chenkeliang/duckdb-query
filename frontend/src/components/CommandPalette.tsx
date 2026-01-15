import * as React from "react"
import { useTranslation } from "react-i18next"
import {
  Database,
  FileText,
  Code2,
  Table,
  Upload,
  Download,
  RefreshCw,
  Settings,
  Moon,
  Sun,
  Languages,
} from "lucide-react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { useDuckDBTables } from "@/hooks/useDuckDBTables"
import { useShortcuts } from "@/Settings/shortcuts"

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate?: (path: string) => void
  onAction?: (action: string, params?: unknown) => void
  /** @deprecated 使用 TanStack Query 自动获取表列表 */
  tables?: Array<{ name: string; rowCount?: number }>
}

export function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  onAction,
  tables: propTables,
}: CommandPaletteProps) {
  const { t } = useTranslation("common")
  
  // 从 TanStack Query 缓存获取表列表
  const { tables: queryTables, isLoading: isLoadingTables } = useDuckDBTables()
  
  // 获取自定义快捷键
  const { getShortcutForAction } = useShortcuts()
  
  // 格式化快捷键显示（将 Cmd+K 转换为 ⌘K）
  const formatShortcutDisplay = React.useCallback((actionId: string): string => {
    const shortcut = getShortcutForAction(actionId)
    return shortcut
      .replace('Cmd+', '⌘')
      .replace('Ctrl+', '⌃')
      .replace('Alt+', '⌥')
      .replace('Shift+', '⇧')
      .replace(/\+/g, '')
  }, [getShortcutForAction])
  
  // 优先使用 props 传入的表列表，否则使用 TanStack Query 获取的
  const tables = React.useMemo(() => {
    if (propTables && propTables.length > 0) {
      return propTables.map(t => ({ name: t.name, row_count: t.rowCount }))
    }
    return queryTables
  }, [propTables, queryTables])

  const runCommand = React.useCallback(
    (command: () => void) => {
      onOpenChange(false)
      command()
    },
    [onOpenChange]
  )

  // 格式化行数显示
  const formatRowCount = (count?: number) => {
    if (!count) return null
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M rows`
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K rows`
    return `${count.toLocaleString()} rows`
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t("command.placeholder", "Type a command or search...")} />
      <CommandList>
        <CommandEmpty>{t("command.noResults", "No results found.")}</CommandEmpty>
        
        {/* 导航命令 */}
        <CommandGroup heading={t("command.navigation", "Navigation")}>
          <CommandItem
            onSelect={() => runCommand(() => onNavigate?.("datasource"))}
          >
            <Database className="mr-2 h-4 w-4" />
            <span>{t("nav.datasource", "Data Source")}</span>
            <CommandShortcut>{formatShortcutDisplay('navigateDataSource')}</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onNavigate?.("queryworkbench"))}
          >
            <Code2 className="mr-2 h-4 w-4" />
            <span>{t("nav.queryworkbench", "Query Workbench")}</span>
            <CommandShortcut>{formatShortcutDisplay('navigateQueryWorkbench')}</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        
        <CommandSeparator />
        
        {/* 表搜索 - 从 TanStack Query 缓存获取 */}
        <CommandGroup heading={t("command.tables", "Tables")}>
          {isLoadingTables ? (
            <CommandItem disabled>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              <span className="text-muted-foreground">{t("common.loading", "Loading...")}</span>
            </CommandItem>
          ) : tables.length > 0 ? (
            tables.map((table) => (
              <CommandItem
                key={table.name}
                value={table.name}
                onSelect={() => runCommand(() => onAction?.("selectTable", table.name))}
              >
                <Table className="mr-2 h-4 w-4" />
                <span>{table.name}</span>
                {table.row_count && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatRowCount(table.row_count)}
                  </span>
                )}
              </CommandItem>
            ))
          ) : (
            <CommandItem disabled>
              <span className="text-muted-foreground">{t("command.noTables", "No tables available")}</span>
            </CommandItem>
          )}
        </CommandGroup>
        
        <CommandSeparator />
        
        {/* 数据操作命令 */}
        <CommandGroup heading={t("command.dataActions", "Data Actions")}>
          <CommandItem
            onSelect={() => runCommand(() => onAction?.("upload"))}
          >
            <Upload className="mr-2 h-4 w-4" />
            <span>{t("actions.uploadFile", "Upload File")}</span>
            <CommandShortcut>{formatShortcutDisplay('uploadFile')}</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onAction?.("export"))}
          >
            <Download className="mr-2 h-4 w-4" />
            <span>{t("actions.exportData", "Export Data")}</span>
            <CommandShortcut>⌘E</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onAction?.("refresh"))}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            <span>{t("actions.refreshData", "Refresh Data")}</span>
            <CommandShortcut>{formatShortcutDisplay('refreshData')}</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        
        <CommandSeparator />
        
        {/* 快捷操作命令 */}
        <CommandGroup heading={t("command.quickActions", "Quick Actions")}>
          <CommandItem
            onSelect={() => runCommand(() => onAction?.("toggleTheme"))}
          >
            <Sun className="mr-2 h-4 w-4 dark:hidden" />
            <Moon className="mr-2 h-4 w-4 hidden dark:block" />
            <span>{t("actions.toggleTheme", "Toggle Theme")}</span>
            <CommandShortcut>{formatShortcutDisplay('toggleTheme')}</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onAction?.("toggleLanguage"))}
          >
            <Languages className="mr-2 h-4 w-4" />
            <span>{t("actions.toggleLanguage", "Toggle Language")}</span>
            <CommandShortcut>{formatShortcutDisplay('toggleLanguage')}</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        
        <CommandSeparator />
        
        {/* 系统命令 */}
        <CommandGroup heading={t("command.system", "System")}>
          <CommandItem
            onSelect={() => runCommand(() => onAction?.("settings"))}
          >
            <Settings className="mr-2 h-4 w-4" />
            <span>{t("nav.settings", "Settings")}</span>
            <CommandShortcut>⌘,</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onAction?.("help"))}
          >
            <FileText className="mr-2 h-4 w-4" />
            <span>{t("nav.help", "Help")}</span>
            <CommandShortcut>⌘?</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
