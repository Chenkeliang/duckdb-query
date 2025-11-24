import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { defaultLocale, messages } from "./messages";

const I18nContext = createContext({
  locale: defaultLocale,
  setLocale: () => {},
  t: (key) => key
});

const LOCALE_KEY = "dq-locale";

const getInitialLocale = () => {
  if (typeof window === "undefined") return defaultLocale;
  const search = new URLSearchParams(window.location.search).get("lang");
  const stored = localStorage.getItem(LOCALE_KEY);
  const candidate = search || stored || (navigator.language || "").slice(0, 2);
  return Object.keys(messages).includes(candidate) ? candidate : defaultLocale;
};

export const I18nProvider = ({ children }) => {
  const [locale, setLocaleState] = useState(getInitialLocale);

  const setLocale = (next) => {
    setLocaleState(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCALE_KEY, next);
    }
  };

  const t = useMemo(() => {
    return (key) => key.split(".").reduce((acc, k) => acc && acc[k], messages[locale]) || key;
  }, [locale]);

  useEffect(() => {
    // sync stored locale on mount in case URL param overrides
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCALE_KEY, locale);
    }
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => useContext(I18nContext);
