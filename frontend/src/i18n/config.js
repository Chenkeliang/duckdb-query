import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zhCommon from "./locales/zh/common.json";
import enCommon from "./locales/en/common.json";

const STORAGE_KEY = "dq-locale";

const detectInitialLocale = () => {
  if (typeof window === "undefined") return "zh";
  const search = new URLSearchParams(window.location.search).get("lang");
  const stored = localStorage.getItem(STORAGE_KEY);
  const browser = (navigator.language || "").slice(0, 2);
  const candidate = search || stored || browser || "zh";
  return ["zh", "en"].includes(candidate) ? candidate : "zh";
};

const resources = {
  zh: { common: zhCommon },
  en: { common: enCommon }
};

i18n.use(initReactI18next).init({
  resources,
  lng: detectInitialLocale(),
  fallbackLng: "zh",
  interpolation: { escapeValue: false },
  defaultNS: "common"
});

i18n.on("languageChanged", lng => {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, lng);
    }
  } catch {
    // ignore
  }
});

export default i18n;
