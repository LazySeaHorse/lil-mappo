import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { captureLandingAttribution } from "./lib/analytics/attribution";
import { IS_DEMO, IS_DEMO_SHELL } from "./demo/isDemo";
import "./index.css";

// Register all annotation styles before rendering
import './annotations/styles/index';

// Keep utm_* / ref for signup attribution, then clean them from the address bar.
if (!IS_DEMO) captureLandingAttribution();

const DemoShell = lazy(() => import("./demo/shell/DemoShell"));

createRoot(document.getElementById("root")!).render(
  IS_DEMO_SHELL ? <Suspense fallback={null}><DemoShell /></Suspense> : <App />,
);
