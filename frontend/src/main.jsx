import React from "react";
import ReactDOM from "react-dom/client";
import ShadcnApp from "./ShadcnApp.jsx";
import DuckQueryApp from "./DuckQueryApp.jsx";
import "./styles/tailwind.css";
import "./styles/modern.css";

const layoutParam = new URLSearchParams(window.location.search).get("layout");
const useNewLayout =
  layoutParam === "new" ||
  (layoutParam !== "legacy" &&
    localStorage.getItem("dq-use-new-layout") === "1");

const RootApp = useNewLayout ? DuckQueryApp : ShadcnApp;

ReactDOM.createRoot(document.getElementById("root")).render(<RootApp />);
