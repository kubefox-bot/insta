import { mock } from "bun:test";
import { expect } from "@playwright/test";

const [suite, name, mode] = process.argv.slice(2);
const original = new Error(
  mode === "second setup" ? "second setup failed" : "original test failure",
);
const cleanup = new Error("first cleanup failed");
const events: string[] = [];
let timeoutMs = 30000;
const operations = new Map<
  string,
  (input: {
    page: {
      goto: () => Promise<never>;
      setViewportSize: () => Promise<void>;
      unrouteAll: () => Promise<void>;
    };
    browser: {
      newContext: () => Promise<{
        newPage: () => Promise<never>;
        close: () => Promise<void>;
      }>;
    };
    context: { newPage: () => Promise<{ close: () => Promise<void> }> };
  }) => Promise<void>
>();
const register = Object.assign(
  (title: string, operation: Parameters<typeof operations.set>[1]) =>
    operations.set(title, operation),
  {
    setTimeout: (value: number) => {
      timeoutMs = value;
    },
    info: () => ({ timeout: timeoutMs }),
  },
);
mock.module("../../fixtures/browser-egress/test", () => ({
  test: register,
  expect,
}));
const account = {
  id: "012345678901234567890123",
  username: "Synthetic",
  email: "owned@example.test",
  password: "synthetic-only",
};
mock.module("../../fixtures/chat05/browser", () => ({
  startChatFixture: async () => ({
    alice: account,
    bob: account,
    mallory: account,
    url: "http://owned.invalid",
    dispose: async () => {
      events.push("chat");
      if (mode === "single cleanup") throw cleanup;
    },
  }),
}));
mock.module("../../fixtures/auth05/browser", () => ({
  startAuthFixture: async () => {
    if (mode === "second setup") throw original;
    return {
      account,
      secondAccount: account,
      signupEmail: account.email,
      noJsEmail: account.email,
      url: "http://owned.invalid",
      dispose: async () => {
        events.push("auth");
        if (mode === "first auth cleanup") throw cleanup;
      },
    };
  },
}));
await import(`../../e2e/${suite}.spec.ts`);
const operation = operations.get(name ?? "");
if (!operation) throw new Error("Missing actual registered consumer");
const error = await operation({
  page: {
    goto: async () => {
      throw original;
    },
    setViewportSize: async () => {},
    unrouteAll: async () => {
      events.push("routes");
      throw cleanup;
    },
  },
  browser: {
    newContext: async () => {
      if (mode === "newContext setup") throw original;
      return {
        newPage: async () => {
          throw original;
        },
        close: async () => {
          events.push("peer");
          if (mode === "peer cleanup") throw cleanup;
        },
      };
    },
  },
  context: {
    newPage: async () => {
      if (mode === "newPage setup") throw original;
      return {
        close: async () => {
          events.push("page");
          throw cleanup;
        },
      };
    },
  },
}).then(
  () => undefined,
  (failure: unknown) => failure,
);
const leaves = (failure: unknown): unknown[] => {
  if (failure instanceof AggregateError) return failure.errors.flatMap(leaves);
  if (failure instanceof SuppressedError)
    return [...leaves(failure.error), ...leaves(failure.suppressed)];
  return [failure];
};
const failures = leaves(error);
console.log(
  JSON.stringify({
    events,
    original: failures.includes(original),
    cleanup: failures.includes(cleanup),
    timeoutMs,
  }),
);
