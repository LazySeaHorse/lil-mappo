import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { captureLandingAttribution } from "./lib/analytics/attribution";
import { IS_DEMO, IS_DEMO_FRAME, IS_DEMO_SHELL } from "./demo/isDemo";
import { loadDemoFrameSetup, loadDemoShell } from "./lib/lazyModules";
import "./index.css";

// Register all annotation styles before rendering
import './annotations/styles/index';

// Keep utm_* / ref for signup attribution, then clean them from the address bar.
if (!IS_DEMO) captureLandingAttribution();

// Pure, so builds without the demo drop it along with its chunk.
const DemoShell = /* @__PURE__ */ lazy(loadDemoShell);

const render = () =>
  createRoot(document.getElementById("root")!).render(
    IS_DEMO_SHELL ? <Suspense fallback={null}><DemoShell /></Suspense> : <App />,
  );

// The demo frame quiets the app and blocks real input before it renders.
if (IS_DEMO_FRAME) {
  void loadDemoFrameSetup().then(({ setupDemoFrame }) => {
    setupDemoFrame();
    render();
  });
} else {
  render();
}
