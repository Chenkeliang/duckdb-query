/**
 * ShortcutSettings - Settings page component for managing keyboard shortcuts
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useShortcuts } from './ShortcutContext';
import { ShortcutRecorder } from './ShortcutRecorder';
import { SHORTCUT_CATEGORIES, ShortcutConfig } from './defaultShortcuts';
import { RotateCcw, Keyboard, Circle } from 'lucide-react';
import { showSuccessToast, showErrorToast } from '@/utils/toastHelpers';

export function ShortcutSettings() {
  const { t } = useTranslation('common');
  const {
    shortcuts,
    isLoading,
    updateShortcut,
    resetShortcut,
    resetAllShortcuts,
    isCustomized,
  } = useShortcuts();

  // Group shortcuts by category
  const groupedShortcuts = useMemo(() => {
    const groups: Record<string, ShortcutConfig[]> = {
      navigation: [],
      actions: [],
      ui: [],
    };

    for (const config of Object.values(shortcuts)) {
      if (groups[config.category]) {
        groups[config.category].push(config);
      }
    }

    return groups;
  }, [shortcuts]);

  // Get all existing shortcuts for conflict detection
  const existingShortcuts = useMemo(() => {
    return Object.values(shortcuts).map((s) => s.shortcut);
  }, [shortcuts]);

  // Handle shortcut update
  const handleUpdateShortcut = async (actionId: string, newShortcut: string) => {
    try {
      await updateShortcut(actionId, newShortcut);
      showSuccessToast(t, 'SHORTCUT_UPDATED', t('shortcuts.updateSuccess', 'Shortcut updated'));
    } catch {
      showErrorToast(t, 'SHORTCUT_UPDATE_FAILED', t('shortcuts.updateError', 'Failed to update shortcut'));
    }
  };

  // Handle single reset
  const handleResetShortcut = async (actionId: string) => {
    try {
      await resetShortcut(actionId);
      showSuccessToast(t, 'SHORTCUT_RESET', t('shortcuts.resetSuccess', 'Shortcut reset to default'));
    } catch {
      showErrorToast(t, 'SHORTCUT_RESET_FAILED', t('shortcuts.resetError', 'Failed to reset shortcut'));
    }
  };

  // Handle reset all
  const handleResetAll = async () => {
    try {
      await resetAllShortcuts();
      showSuccessToast(t, 'SHORTCUTS_RESET_ALL', t('shortcuts.resetAllSuccess', 'All shortcuts reset to defaults'));
    } catch {
      showErrorToast(t, 'SHORTCUTS_RESET_ALL_FAILED', t('shortcuts.resetAllError', 'Failed to reset shortcuts'));
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {t('common.loading', 'Loading...')}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            <CardTitle>{t('shortcuts.title', 'Keyboard Shortcuts')}</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetAll}
            className="gap-1"
          >
            <RotateCcw className="h-4 w-4" />
            {t('shortcuts.resetAll', 'Reset All')}
          </Button>
        </div>
        <CardDescription>
          {t('shortcuts.description', 'Customize keyboard shortcuts. Click on a shortcut to change it.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
          <div key={category} className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              {t(SHORTCUT_CATEGORIES[category as keyof typeof SHORTCUT_CATEGORIES], category)}
            </h3>
            <div className="space-y-2">
              {categoryShortcuts.map((config) => (
                <ShortcutItem
                  key={config.actionId}
                  config={config}
                  isCustomized={isCustomized(config.actionId)}
                  existingShortcuts={existingShortcuts.filter(
                    (s) => s !== config.shortcut
                  )}
                  onUpdate={(shortcut) => handleUpdateShortcut(config.actionId, shortcut)}
                  onReset={() => handleResetShortcut(config.actionId)}
                />
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

interface ShortcutItemProps {
  config: ShortcutConfig;
  isCustomized: boolean;
  existingShortcuts: string[];
  onUpdate: (shortcut: string) => void;
  onReset: () => void;
}

function ShortcutItem({
  config,
  isCustomized,
  existingShortcuts,
  onUpdate,
  onReset,
}: ShortcutItemProps) {
  const { t } = useTranslation('common');

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2">
        {isCustomized && (
          <Circle className="h-2 w-2 fill-primary text-primary" />
        )}
        <span className="text-sm">{t(config.label, config.actionId)}</span>
        {isCustomized && (
          <span className="text-xs text-muted-foreground">
            ({t('shortcuts.default', 'default')}: {config.defaultShortcut})
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <ShortcutRecorder
          value={config.shortcut}
          onChange={onUpdate}
          onCancel={() => {}}
          existingShortcuts={existingShortcuts}
        />
        {isCustomized && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-7 w-7 p-0"
            title={t('shortcuts.resetToDefault', 'Reset to default')}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default ShortcutSettings;
