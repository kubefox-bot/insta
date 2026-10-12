import { expect, test } from "bun:test";
import { observeFeedVisibility } from "../visibility";

test("first visible display and hidden-to-visible request once; release removes subscription", () => {
  const events = new EventTarget();
  const state = {
    visibility: "visible" as DocumentVisibilityState,
    requests: 0,
  };
  const release = observeFeedVisibility({
    visibility: {
      get visibilityState() {
        return state.visibility;
      },
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    },
    request: () => {
      state.requests++;
    },
  });
  expect(state.requests).toBe(1);
  events.dispatchEvent(new Event("visibilitychange"));
  expect(state.requests).toBe(1);
  state.visibility = "hidden";
  events.dispatchEvent(new Event("visibilitychange"));
  expect(state.requests).toBe(1);
  state.visibility = "visible";
  events.dispatchEvent(new Event("visibilitychange"));
  expect(state.requests).toBe(2);
  release();
  state.visibility = "hidden";
  events.dispatchEvent(new Event("visibilitychange"));
  state.visibility = "visible";
  events.dispatchEvent(new Event("visibilitychange"));
  expect(state.requests).toBe(2);
});

test("a hidden first display waits until visibility returns", () => {
  const events = new EventTarget();
  const state = {
    visibility: "hidden" as DocumentVisibilityState,
    requests: 0,
  };
  const release = observeFeedVisibility({
    visibility: {
      get visibilityState() {
        return state.visibility;
      },
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    },
    request: () => {
      state.requests++;
    },
  });
  expect(state.requests).toBe(0);
  state.visibility = "visible";
  events.dispatchEvent(new Event("visibilitychange"));
  expect(state.requests).toBe(1);
  release();
});
