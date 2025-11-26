import React from "react";
import ReactDOM from "react-dom/client";
import DuckQueryApp from "./DuckQueryApp.jsx";
import "./styles/tokens.css";
import "./styles/tailwind.css";
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./i18n/config";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n/config";

ReactDOM.createRoot(document.getElementById("root")).render(
  <I18nextProvider i18n={i18n}>
    <DuckQueryApp />
  </I18nextProvider>
);
