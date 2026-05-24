import { useEffect, useState } from 'react';
import { getSqlEditorIsDarkMode } from './sqlEditorTheme';

/** 与 document.documentElement.dark 同步，用于编辑器外壳样式 */
export function useSqlEditorDarkMode(): boolean {
  const [isDark, setIsDark] = useState(getSqlEditorIsDarkMode);

  useEffect(() => {
    const sync = () => setIsDark(getSqlEditorIsDarkMode());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  return isDark;
}
