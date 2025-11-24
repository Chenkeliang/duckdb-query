import React from "react";
import ReactDOM from "react-dom/client";
import ShadcnApp from "./ShadcnApp.jsx";
import DuckQueryApp from "./DuckQueryApp.jsx";
import "./styles/tokens.css";
import "./styles/tailwind.css";
import "./i18n/config";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n/config";

const layoutParam = new URLSearchParams(window.location.search).get("layout");
const useNewLayout =
  layoutParam === "new" ||
  (layoutParam !== "legacy" &&
    localStorage.getItem("dq-use-new-layout") === "1");

const RootApp = useNewLayout ? DuckQueryApp : ShadcnApp;

ReactDOM.createRoot(document.getElementById("root")).render(
  <I18nextProvider i18n={i18n}>
    <RootApp />
  </I18nextProvider>
);
