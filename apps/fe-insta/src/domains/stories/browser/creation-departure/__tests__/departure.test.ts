import { expect, test } from "bun:test";
import { get, writable } from "svelte/store";
import type { RecorderView } from "../../recorder/types";
import { createCreationDeparture } from "../create";

const fixture = (initial: RecorderView) => {
  const view = writable(initial);
  const outcomes: string[] = [];
  const departure = createCreationDeparture({
    recorder: {
      view,
      hasPendingPublication: () =>
        ["checking", "uploading"].includes(get(view).kind),
      close: async () => {
        outcomes.push("closed");
        view.set({ kind: "closed" });
      },
    },
    hasPreview: () => get(view).kind === "preview",
    finish: async () => {
      outcomes.push("returned");
    },
  });
  return { view, outcomes, departure };
};
test("ready closes immediately but preview cancellation preserves recording", async () => {
  const f = fixture({ kind: "preview", url: "blob:original" });
  await f.departure.request();
  expect(get(f.departure.view)).toBe("discard");
  f.departure.cancel();
  expect(f.outcomes).toEqual([]);
  expect(get(f.view)).toEqual({ kind: "preview", url: "blob:original" });
  await f.departure.request();
  await f.departure.confirm();
  expect(f.outcomes).toEqual(["closed", "returned"]);
  const empty = fixture({
    kind: "ready",
    camera: { state: { status: "idle" }, stream: null },
  });
  await empty.departure.request();
  expect(empty.outcomes).toEqual(["closed", "returned"]);
});
test("unknown publication exit has a distinct warning, never a discard claim", async () => {
  const f = fixture({ kind: "checking", operationId: "op", status: "unknown" });
  await f.departure.request();
  expect(get(f.departure.view)).toBe("uncertain");
  expect(f.outcomes).toEqual([]);
  await f.departure.confirm();
  expect(f.outcomes).toEqual(["closed", "returned"]);
});

test("confirmation captures the chosen destination before closed-view cleanup resets the prompt", async () => {
  const barrier = Promise.withResolvers<void>();
  const outcomes: string[] = [];
  const view = writable<RecorderView>({
    kind: "preview",
    url: "blob:original",
  });
  const departure = createCreationDeparture({
    recorder: {
      view,
      hasPendingPublication: () => false,
      close: async () => {
        view.set({ kind: "closed" });
        await barrier.promise;
      },
    },
    hasPreview: () => true,
    finish: async () => {
      outcomes.push("host");
    },
  });
  await departure.request(async () => {
    outcomes.push("chosen-route");
  });
  const confirmation = departure.confirm();
  departure.cancel();
  barrier.resolve();
  await confirmation;
  expect(outcomes).toEqual(["chosen-route"]);
});
