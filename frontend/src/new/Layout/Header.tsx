import { Sun, Moon, Languages, Github } from "lucide-react";
import { Button } from "@/new/components/ui/button";

interface HeaderProps {
  title?: string;
  titleNode?: React.ReactNode;
  children?: React.ReactNode;
  isDarkMode?: boolean;
  onToggleTheme?: () => void;
  locale?: string;
  onLocaleChange?: () => void;
  onOpenGithub?: () => void;
}

/**
 * Simple header bar for new layout.
 * Left: page title（或自定义节点）；Right: 页面级操作（Tabs / 按钮等）+ 全局操作图标。
 * 
 * Note: This component is a container. Child components should use shadcn/ui Button
 * components when needed.
 */
const Header = ({ 
  title, 
  titleNode, 
  children,
  isDarkMode,
  onToggleTheme,
  onLocaleChange,
  onOpenGithub
}: HeaderProps) => {
  const renderedTitle =
    titleNode ||
    (title ? (
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
    ) : null);

  return (
    <div className="dq-layout-header-inner flex h-14 items-center justify-between px-4 bg-surface border-b border-border">
      <div className="flex items-center gap-6">{renderedTitle}</div>
      <div className="flex items-center gap-2">
        {children}
        
        {/* 全局操作图标 */}
        <div className="flex items-center gap-1 ml-2 border-l border-border pl-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleTheme}
            className="h-8 w-8"
          >
            {isDarkMode ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onLocaleChange}
            className="h-8 w-8"
          >
            <Languages className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenGithub}
            className="h-8 w-8"
          >
            <Github className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Header;
