import { expect, test } from "bun:test";
import { get } from "svelte/store";
import { createAuthBrowser } from "../../../apps/fe-insta/src/domains/users/browser/store";
import { submitAuthAction } from "../../../apps/fe-insta/src/domains/users/browser/use-cases/submit";

for (const revocation of ["pending", "confirmed"] as const) {
  test(`logout still posts after local cleanup failure and preserves ${revocation} outcome`, async () => {
    const failure = new Error("Synthetic private resource failure");
    const calls: string[] = [];
    const auth = createAuthBrowser({
      initial: {
        actor: { userId: "one", username: "One", generation: "S1" },
        status: "authenticated",
      },
      read: async () => null,
      synchronization: {
        exclusive: async (execute) => execute(),
        publish: () => {},
        subscribe: () => () => {},
      },
      clearPrivate: () => {},
    });
    auth.registerPrivate(() => {
      calls.push("failing cleanup");
      throw failure;
    });
    auth.registerPrivate(() => {
      calls.push("other cleanup");
    });
    let pending = true;
    const attempt = submitAuthAction({
      logout: true,
      ports: {
        auth,
        post: async () => {
          calls.push("logout POST");
          return { receipt: "logout", successful: true, revocation };
        },
        apply: async () => {
          calls.push("applied");
        },
        reset: () => {
          calls.push("reset");
        },
        refresh: async () => {
          calls.push("refreshed");
        },
        onPending: (value) => {
          pending = value;
        },
      },
    });
    const outcome = await attempt.then(
      (value) => value,
      () => null,
    );
    expect(calls).toContain("logout POST");
    expect(calls).toContain("other cleanup");
    expect(pending).toBe(false);
    expect(get(auth.view)).toMatchObject({
      actor: null,
      revocation,
      issue: "PRIVATE_CLEANUP_FAILED",
    });
    expect(outcome?.isError()).toBe(true);
    if (!outcome?.isError()) throw new Error("Missing cleanup outcome");
    expect(outcome.getError().cause).toBeInstanceOf(AggregateError);
    expect(outcome.getError().outcome).toEqual({
      state: "applied",
      revocation,
    });
  });
}

test("unknown logout response reconciles current S2 and a new action clears only the local diagnostic", async () => {
  const current = { userId: "two", username: "Two", generation: "S2" };
  const auth = createAuthBrowser({
    initial: {
      actor: { userId: "one", username: "One", generation: "S1" },
      status: "authenticated",
    },
    read: async () => current,
    synchronization: {
      exclusive: async (execute) => execute(),
      publish: () => {},
      subscribe: () => () => {},
    },
    clearPrivate: () => {},
  });
  const release = auth.registerPrivate(() => {
    throw new Error("Synthetic cleanup failure");
  });
  let pending = true;
  const ports = {
    auth,
    post: async () => {
      throw new Error("Unknown response");
    },
    apply: async () => {},
    refresh: async () => {},
    reset: () => {},
    onPending: (value: boolean) => {
      pending = value;
    },
  };
  const result = await submitAuthAction({ logout: true, ports });
  expect(result.isError()).toBe(true);
  if (!result.isError()) throw new Error("Missing local failure");
  expect(result.getError().outcome.state).toBe("reconciled");
  expect(get(auth.view)).toMatchObject({
    actor: current,
    issue: "PRIVATE_CLEANUP_FAILED",
  });
  expect(pending).toBe(false);
  release();
  await submitAuthAction({
    logout: false,
    ports: {
      ...ports,
      post: async () => ({ receipt: "new", successful: false }),
    },
  });
  expect(get(auth.view).actor).toEqual(current);
  expect(get(auth.view).issue).toBeUndefined();
});
