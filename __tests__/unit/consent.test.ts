import { expect, test } from "bun:test";
import {
  allowAnalytics,
  readPreference,
  savePreference,
} from "../../apps/be-insta/src/domains/privacy/index";
import { createOptionalTelemetry } from "../../apps/fe-insta/src/domains/privacy/browser/optional-telemetry";
import type { OptionalAdapter } from "../../apps/fe-insta/src/domains/privacy/ports/optional-telemetry";
import { createMemoryPreferences } from "../fixtures/privacy";

const setup = () => {
  const preferences = createMemoryPreferences();
  const time = { now: 1000 };
  const clock = () => time.now;
  const random = {
    proof: () => "a".repeat(43),
    digest: async (value: string) => value,
  };
  return { preferences, clock, random, time };
};
test("defaults_to_necessary", async () => {
  expect(await readPreference({}, setup())).toEqual({
    choice: "necessary",
    policyVersion: 1,
    revision: 0,
    needsChoice: true,
  });
});
test("rejects_stale_policy", async () => {
  const result = await savePreference(
    { choice: "all", policyVersion: 0, source: "test" },
    setup(),
  );
  expect(result.isError()).toBe(true);
});
test("fails_closed_on_store_error", async () => {
  const deps = setup();
  deps.preferences.fail = true;
  expect(
    (await readPreference({ contextProof: "a".repeat(43) }, deps)).choice,
  ).toBe("necessary");
  expect(
    await allowAnalytics(
      {
        reference: {
          contextId: "x",
          revision: 1,
          policyVersion: 1,
          generation: "g",
        },
      },
      deps,
    ),
  ).toBe("unavailable");
});
test("does_not_extend_expiry_on_read", async () => {
  const deps = setup();
  const saved = await savePreference(
    { choice: "all", policyVersion: 1, source: "test" },
    deps,
  );
  expect(saved.isOk()).toBe(true);
  if (saved.isError()) return;
  const original = saved.get();
  deps.time.now += 100;
  expect(
    (await readPreference({ contextProof: original.contextProof }, deps))
      .choice,
  ).toBe("all");
  expect(
    deps.preferences.records.get(original.preference.contextId)?.expiresAt,
  ).toBe(original.preference.expiresAt);
  deps.time.now = original.preference.expiresAt;
  expect(
    (await readPreference({ contextProof: original.contextProof }, deps))
      .needsChoice,
  ).toBe(true);
});
test("CAS rejects stale updates and revision gates optional effects", async () => {
  const deps = setup();
  const first = await savePreference(
    { choice: "all", policyVersion: 1, source: "test" },
    deps,
  );
  if (first.isError()) throw new Error("save failed");
  const { contextProof, preference } = first.get();
  expect(await allowAnalytics({ reference: preference }, deps)).toBe("allowed");
  const revoke = await savePreference(
    {
      contextProof,
      expectedRevision: 1,
      choice: "necessary",
      policyVersion: 1,
      source: "test",
    },
    deps,
  );
  expect(revoke.isOk()).toBe(true);
  expect(await allowAnalytics({ reference: preference }, deps)).toBe("denied");
  expect(
    (
      await savePreference(
        {
          contextProof,
          expectedRevision: 1,
          choice: "all",
          policyVersion: 1,
          source: "test",
        },
        deps,
      )
    ).isError(),
  ).toBe(true);
});
test("missing and necessary never load adapters; revocation cancels a pending load", async () => {
  const loaded: string[] = [];
  const stopped: string[] = [];
  const control = createOptionalTelemetry({
    adapters: [
      async () => {
        loaded.push("load");
        return {
          start: () => {
            loaded.push("start");
          },
          stop: () => {
            stopped.push("stop");
          },
          clear: () => {
            stopped.push("clear");
          },
        };
      },
    ],
  });
  await control.start({
    choice: "necessary",
    revision: 0,
    policyVersion: 1,
  });
  expect(loaded).toHaveLength(0);
  await control.start({
    choice: "all",
    revision: 1,
    policyVersion: 1,
  });
  expect(loaded).toEqual(["load", "start"]);
  await control.stop();
  expect(stopped).toEqual(["stop", "clear"]);
});
test("revocation during lazy loading never starts a stale adapter", async () => {
  const barrier =
    Promise.withResolvers<
      import("../../apps/fe-insta/src/domains/privacy/ports/optional-telemetry").OptionalAdapter
    >();
  const entered = Promise.withResolvers<void>();
  const effects: string[] = [];
  const telemetry = createOptionalTelemetry({
    adapters: [
      () => {
        entered.resolve();
        return barrier.promise;
      },
    ],
  });
  const start = telemetry.start({
    choice: "all",
    policyVersion: 1,
    revision: 1,
  });
  await entered.promise;
  await telemetry.stop();
  barrier.resolve({
    start: () => {
      effects.push("start");
    },
    stop: () => {
      effects.push("stop");
    },
    clear: () => {
      effects.push("clear");
    },
  });
  await start;
  expect(effects).toEqual(["stop", "clear"]);
});
test("concurrent confirmed starts load only the latest revision", async () => {
  const calls: string[] = [];
  const telemetry = createOptionalTelemetry({
    adapters: [
      async () => {
        calls.push("load");
        return {
          start: () => {
            calls.push("start");
          },
          stop: () => {},
          clear: () => {},
        };
      },
    ],
  });
  await Promise.all(
    [1, 2].map((revision) =>
      telemetry.start({
        choice: "all",
        policyVersion: 1,
        revision,
      }),
    ),
  );
  expect(calls).toEqual(["load", "start"]);
  await telemetry.stop();
});
test("Native missing/invalid/stale/expired/unavailable normalize to revision0; valid choices have positive revision", async () => {
  for (const mode of [
    "missing",
    "invalid",
    "unknown",
    "expired",
    "policy",
    "generation",
    "corruptRevision",
    "unavailable",
  ] as const) {
    const deps = setup();
    const first = await savePreference(
      { choice: "all", policyVersion: 1, source: "test" },
      deps,
    );
    if (first.isError()) throw new Error(first.getError());
    const saved = first.get();
    const record = saved.preference;
    const changes = {
      missing: record,
      invalid: record,
      unknown: record,
      expired: { ...record, expiresAt: deps.time.now },
      policy: { ...record, policyVersion: 2 },
      generation: { ...record, generation: "old" },
      corruptRevision: { ...record, revision: 0 },
      unavailable: record,
    };
    deps.preferences.records.set(record.contextId, changes[mode]);
    deps.preferences.fail = mode === "unavailable";
    const proof = {
      missing: undefined,
      invalid: "true",
      unknown: "b".repeat(43),
      expired: saved.contextProof,
      policy: saved.contextProof,
      generation: saved.contextProof,
      corruptRevision: saved.contextProof,
      unavailable: saved.contextProof,
    }[mode];
    const read = await readPreference({ contextProof: proof }, deps);
    expect(read).toEqual({
      choice: "necessary",
      policyVersion: 1,
      revision: 0,
      needsChoice: true,
    });
  }
  const deps = setup();
  const first = await savePreference(
    { choice: "necessary", policyVersion: 1, source: "test" },
    deps,
  );
  if (first.isError()) throw new Error(first.getError());
  expect(
    await readPreference({ contextProof: first.get().contextProof }, deps),
  ).toEqual({
    choice: "necessary",
    policyVersion: 1,
    revision: 1,
    needsChoice: false,
  });
});

test("late optional initialization retains failed cleanup for a later stop retry", async () => {
  const loaded = Promise.withResolvers<OptionalAdapter>();
  const entered = Promise.withResolvers<void>();
  const state = { stops: 0, clears: 0, active: true };
  const telemetry = createOptionalTelemetry({
    adapters: [
      () => {
        entered.resolve();
        return loaded.promise;
      },
    ],
  });
  const starting = telemetry.start({
    choice: "all",
    policyVersion: 1,
    revision: 1,
  });
  await entered.promise;
  await telemetry.stop();
  loaded.resolve({
    start: () => {},
    stop: () => {
      state.stops += 1;
      if (state.stops === 1) throw new Error("late cleanup failure");
      state.active = false;
    },
    clear: () => {
      state.clears += 1;
    },
  });
  await expect(starting).rejects.toThrow("Optional adapter cleanup failed");
  expect(state.active).toBe(true);
  await telemetry.stop();
  expect(state.stops).toBe(2);
  expect(state.active).toBe(false);
  expect(state.clears).toBe(2);
});
