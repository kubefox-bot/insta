import { observeBrowserErrors } from "../../../apps/fe-insta/src/lib/observability/browser/errors";
import { loadFaroAdapter } from "../../../apps/fe-insta/src/lib/observability/browser/faro";

let adapter: Awaited<ReturnType<typeof loadFaroAdapter>> | undefined;
const originalOnError = window.onerror;
const probe = {
  outage: () => {
    const release = observeBrowserErrors(() => {
      throw new Error("CANARY_OBSERVER_OUTAGE");
    });
    window.dispatchEvent(
      new ErrorEvent("error", { message: "CANARY_ORIGINAL_ERROR" }),
    );
    release();
  },
  normalErrorOwnerPreserved: () => window.onerror === originalOnError,
  start: async () => {
    adapter = await loadFaroAdapter({
      preference: { choice: "all", revision: 1, policyVersion: 1 },
    });
    await adapter.start();
  },
  stop: async () => {
    await adapter?.stop();
    await adapter?.clear();
  },
  fault: () => {
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "CANARY_PASSWORD_QUERY",
        error: new Error("https://localhost/?email=CANARY_PASSWORD_QUERY"),
      }),
    );
  },
};
declare global {
  interface Window {
    __analyticsProbe: typeof probe;
  }
}
window.__analyticsProbe = probe;
