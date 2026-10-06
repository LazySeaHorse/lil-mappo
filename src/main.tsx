import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { captureLandingAttribution } from "./lib/analytics/attribution";
import "./index.css";

// Register all annotation styles before rendering
import './annotations/styles/index';

// Keep utm_* / ref for signup attribution, then clean them from the address bar.
captureLandingAttribution();

createRoot(document.getElementById("root")!).render(<App />);
