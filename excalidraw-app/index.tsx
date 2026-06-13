import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import "../excalidraw-app/sentry";

import ExcalidrawApp from "./App";
import { CommerceAccount } from "./components/CommerceAccount";
import { applyBranding } from "./data/branding";
import { captureOAuthToken } from "./data/commerce";

window.__EXCALIDRAW_SHA__ = import.meta.env.VITE_APP_GIT_SHA;

// Apply white-label branding (title, theme colour, favicon) before first paint.
applyBranding();

// Capture an OAuth token handed back via the URL fragment (#token=...).
captureOAuthToken();

const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);
registerSW();
root.render(
  <StrictMode>
    <ExcalidrawApp />
    <CommerceAccount />
  </StrictMode>,
);
