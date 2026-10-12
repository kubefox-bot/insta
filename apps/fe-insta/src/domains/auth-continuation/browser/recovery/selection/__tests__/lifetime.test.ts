import { expect, test } from "bun:test";
import { get } from "svelte/store";
import { createSelectionLifetime } from "../lifetime";

test("retired expiry callback cannot release a newer selection", () => {
  const callbacks: (() => void)[] = [];
  const delays: number[] = [];
  const effects: string[] = [];
  const lifetime = createSelectionLifetime({
    now: () => 100,
    schedule: (run, delay) => {
      callbacks.push(run);
      delays.push(delay);
      return () => {
        effects.push("cancel");
      };
    },
    release: () => {
      effects.push("release");
    },
  });
  lifetime.expire(150);
  lifetime.retire();
  lifetime.view.set({ kind: "ready", intentId: "new", expiresAt: 200 });
  lifetime.expire(200);
  callbacks[0]?.();
  expect(get(lifetime.view)).toMatchObject({ intentId: "new" });
  expect(effects).toEqual(["cancel", "release"]);
  expect(delays).toEqual([50, 100]);
  callbacks[1]?.();
  expect(get(lifetime.view)).toEqual({ kind: "unavailable" });
  expect(effects).toEqual(["cancel", "release", "cancel", "release"]);
});
