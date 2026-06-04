import { useCallback, useEffect, useState } from 'react';
import {
  DATAGRID_SETTINGS_EVENT,
  DEFAULT_DATAGRID_SETTINGS,
  loadDataGridSettings,
  saveDataGridSettings,
  type DataGridSettings,
} from '@/utils/dataGridSettingsStorage';

export function useDataGridSettings() {
  const [settings, setSettings] = useState<DataGridSettings>(
    DEFAULT_DATAGRID_SETTINGS
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setSettings(loadDataGridSettings());
    setIsLoading(false);

    // 监听其它组件的设置变更，保持各处结果表同步
    const sync = () => setSettings(loadDataGridSettings());
    window.addEventListener(DATAGRID_SETTINGS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(DATAGRID_SETTINGS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<DataGridSettings>) => {
      const next = { ...settings, ...patch };
      const ok = saveDataGridSettings(next);
      if (ok) setSettings(next);
      return ok;
    },
    [settings]
  );

  return { settings, updateSettings, isLoading };
}
