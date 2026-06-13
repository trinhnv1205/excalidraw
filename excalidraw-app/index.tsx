import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import "../excalidraw-app/sentry";

import ExcalidrawApp from "./App";
import { CommerceAccount } from "./components/CommerceAccount";
import { applyBranding } from "./data/branding";

window.__EXCALIDRAW_SHA__ = import.meta.env.VITE_APP_GIT_SHA;

// Apply white-label branding (title, theme colour, favicon) before first paint.
applyBranding();

const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);
registerSW();
root.render(
  <StrictMode>
    <ExcalidrawApp />
    <CommerceAccount />
  </StrictMode>,
);
