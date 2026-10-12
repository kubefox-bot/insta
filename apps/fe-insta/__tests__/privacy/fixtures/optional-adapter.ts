import type { OptionalAdapter } from "../../../src/domains/privacy/ports/optional-telemetry";
export const createTestAdapter = (revision: number): OptionalAdapter => {
  const state: { controller?: AbortController } = {};
  const observe = () => {
    state.controller = new AbortController();
    fetch(`/__test__/observation?revision=${revision}`, {
      method: "POST",
      signal: state.controller.signal,
    }).catch(() => {});
  };
  return {
    start: () => {
      window.addEventListener("privacy-observation", observe);
      document.documentElement.dataset.optionalActive = String(revision);
    },
    stop: () => {
      window.removeEventListener("privacy-observation", observe);
      delete document.documentElement.dataset.optionalActive;
      state.controller?.abort();
    },
    clear: () => {
      state.controller = undefined;
    },
  };
};
