import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { Panel, getPanelGroupElement, type ImperativePanelHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';

interface ExplorerPanelProps {
  children: React.ReactNode;
  collapsed: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  onToggle: () => void;
}

/** Convert sidebar pixel bounds to the installed panel library's percentages.
 * Observe the workspace, not the sidebar: dragging must not feed React resize
 * state back into the panel being dragged. Hidden content stays mounted.
 */
export const ExplorerPanel = React.forwardRef<ImperativePanelHandle, ExplorerPanelProps>(
  ({ children, collapsed, onCollapse, onExpand, onToggle }, ref) => {
    const { t } = useTranslation('common');
    const [workspaceWidth, setWorkspaceWidth] = React.useState(0);
    React.useLayoutEffect(() => {
      const group = getPanelGroupElement('query-workspace-horizontal');
      if (!group) return;
      const measure = () => {
        const width = group.getBoundingClientRect().width;
        if (width > 0) setWorkspaceWidth(width);
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(group);
      return () => observer.disconnect();
    }, []);

    const percent = (pixels: number) => pixels / workspaceWidth * 100;
    const maxSize = workspaceWidth ? Math.min(45, percent(420)) : 40;
    const minSize = workspaceWidth ? Math.min(maxSize, percent(220)) : 15;
    const defaultSize = workspaceWidth ? Math.max(minSize, Math.min(maxSize, percent(280))) : 20;
    const collapsedSize = workspaceWidth ? Math.min(minSize, percent(36)) : 3;

    return (
      <Panel id="explorer" order={1} ref={ref} collapsible
        defaultSize={defaultSize} minSize={minSize} maxSize={maxSize} collapsedSize={collapsedSize}
        onCollapse={onCollapse} onExpand={onExpand}>
        {collapsed && <div className="flex h-full items-center justify-center border-r border-border bg-surface">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onToggle}
            aria-label={t('workspace.expandDataSource')} title={t('workspace.expandDataSource')}>
            <ChevronRight className="size-4" />
          </Button>
        </div>}
        <div className={collapsed ? 'hidden' : 'h-full min-h-0'}>{children}</div>
      </Panel>
    );
  },
);
ExplorerPanel.displayName = 'ExplorerPanel';
