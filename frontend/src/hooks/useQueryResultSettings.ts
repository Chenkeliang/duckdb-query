import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_QUERY_RESULT_SETTINGS,
  loadQueryResultSettings,
  saveQueryResultSettings,
  type QueryResultSettings,
} from '@/utils/queryResultSettingsStorage';

export function useQueryResultSettings() {
  const [settings, setSettings] = useState<QueryResultSettings>(
    DEFAULT_QUERY_RESULT_SETTINGS
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setSettings(loadQueryResultSettings());
    setIsLoading(false);
  }, []);

  const updateSettings = useCallback((patch: Partial<QueryResultSettings>) => {
    const next = { ...settings, ...patch };
    const ok = saveQueryResultSettings(next);
    if (ok) {
      setSettings(next);
    }
    return ok;
  }, [settings]);

  return {
    settings,
    retainQueryResults: settings.retainQueryResults,
    updateSettings,
    isLoading,
  };
}
