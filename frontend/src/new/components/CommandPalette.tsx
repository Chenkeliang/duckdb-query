import * as React from "react"
import { useTranslation } from "react-i18next"
import {
  Database,
  FileText,
  Search,
  Table,
  Upload,
  Download,
  RefreshCw,
  Settings,
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
} from "@/new/components/ui/command"

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate?: (path: string) => void
  onAction?: (action: string, params?: any) => void
  tables?: Array<{ name: string; rowCount?: number }>
}

export function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  onAction,
  tables = [],
}: CommandPaletteProps) {
  const { t } = useTranslation("common")

  const runCommand = React.useCallback(
    (command: () => void) => {
      onOpenChange(false)
      command()
    },
    [onOpenChange]
  )

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
            <CommandShortcut>⌘D</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onNavigate?.("query"))}
          >
            <Search className="mr-2 h-4 w-4" />
            <span>{t("nav.query", "Query Builder")}</span>
            <CommandShortcut>⌘Q</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onNavigate?.("results"))}
          >
            <Table className="mr-2 h-4 w-4" />
            <span>{t("nav.results", "Results")}</span>
            <CommandShortcut>⌘R</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        
        <CommandSeparator />
        
        {/* 数据操作命令 */}
        <CommandGroup heading={t("command.dataActions", "Data Actions")}>
          <CommandItem
            onSelect={() => runCommand(() => onAction?.("upload"))}
          >
            <Upload className="mr-2 h-4 w-4" />
            <span>{t("actions.uploadFile", "Upload File")}</span>
            <CommandShortcut>⌘U</CommandShortcut>
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
            <CommandShortcut>⌘⇧R</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        
        {/* 表搜索 */}
        {tables.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("command.tables", "Tables")}>
              {tables.map((table) => (
                <CommandItem
                  key={table.name}
                  onSelect={() => runCommand(() => onAction?.("selectTable", table.name))}
                >
                  <Table className="mr-2 h-4 w-4" />
                  <span>{table.name}</span>
                  {table.rowCount && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {table.rowCount.toLocaleString()} rows
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        
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
