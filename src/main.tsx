import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  // Only enable in production and staging; skip in local dev when DSN is absent
  enabled: !!import.meta.env.VITE_SENTRY_DSN,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      // Mask all text and inputs by default — PII protection
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  // 10% of transactions traced in production — adjust once baseline is known
  tracesSampleRate: import.meta.env.PROD ? 0.1 : 0,
  // 5% of sessions recorded for replay in production
  replaysSessionSampleRate: import.meta.env.PROD ? 0.05 : 0,
  // 100% of error sessions get a replay
  replaysOnErrorSampleRate: 1.0,
  // Strip auth tokens and payment keys from breadcrumbs
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.category === "xhr" || breadcrumb.category === "fetch") {
      // Never log Authorization header values
      if (breadcrumb.data?.headers?.Authorization) {
        breadcrumb.data.headers.Authorization = "[Filtered]";
      }
    }
    return breadcrumb;
  },
});

createRoot(document.getElementById("root")!).render(<App />);
