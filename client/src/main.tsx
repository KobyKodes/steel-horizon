import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { SceneSandbox } from "./dev/SceneSandbox";
import "./styles.css";

const isSceneSandbox =
  new URLSearchParams(window.location.search).get("dev") === "scene";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isSceneSandbox ? <SceneSandbox /> : <App />}
  </React.StrictMode>,
);
