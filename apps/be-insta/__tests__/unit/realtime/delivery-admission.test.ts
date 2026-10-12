import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { activateDelivery } from "../../../src/domains/conversations/use-cases/delivery/activate";
import { prepareDelivery } from "../../../src/domains/conversations/use-cases/delivery/prepare";
import { resumeDelivery } from "../../../src/domains/conversations/use-cases/delivery/resume";
import type { Actor } from "../../../src/domains/users/index";
import { errorOf, expectSuccess } from "../../fixtures/realtime/outcome";

const actor = {
  userId: "alice",
  backendSessionId: "session",
  username: "Alice",
  accessExpiresAt: 100000,
} as Actor;
const target = { kind: "conversation", id: "c" } as const;
const head = {
  streamId: "conversation:c",
  epoch: "7ee32a62-1281-4ac6-83e8-7f10d0112244",
  cursor: 10,
};
const signal = new AbortController().signal;
const ports = {
  clock: () => 0,
  uuid: () => "7ee32a62-1281-4ac6-83e8-7f10d0112233",
  authorize: async () => Result.Ok(actor),
  membership: { permits: async () => true },
  journal: {
    head: async () => head,
    range: async () => ({
      kind: "range" as const,
      after: { ...head, cursor: 0 },
      head,
    }),
  },
};
test("prepare returns canonical baseline without touching Streams", async () => {
  const result = await prepareDelivery({ actor, target, signal }, ports);
  expect(result.isOk()).toBe(true);
  expect(expectSuccess(result)).toEqual({
    subscriptionId: "7ee32a62-1281-4ac6-83e8-7f10d0112233",
    baseline: head,
  });
});
test("resume future or wrong epoch requires resync; foreign stream denied before readers", async () => {
  for (const after of [
    { ...head, cursor: 500 },
    { ...head, epoch: "old" },
  ]) {
    expect(
      errorOf(await resumeDelivery({ actor, target, after, signal }, ports)),
    ).toBe("RESYNC_REQUIRED");
  }
  expect(
    errorOf(
      await resumeDelivery(
        {
          actor,
          target,
          after: { ...head, streamId: "conversation:foreign" },
          signal,
        },
        ports,
      ),
    ),
  ).toBe("FORBIDDEN");
});
test("activate rejects altered token/baseline and rechecks retained floor", async () => {
  const prepared = { subscriptionId: ports.uuid(), baseline: head };
  const input = {
    actor,
    target,
    prepared,
    subscriptionId: ports.uuid(),
    baseline: head,
    signal,
  };
  expect(
    errorOf(
      await activateDelivery(
        { ...input, baseline: { ...head, cursor: 11 } },
        ports,
      ),
    ),
  ).toBe("RESYNC_REQUIRED");
  expect(
    errorOf(
      await activateDelivery({ ...input, subscriptionId: "foreign" }, ports),
    ),
  ).toBe("FORBIDDEN");
  const expired = {
    ...ports,
    journal: {
      ...ports.journal,
      range: async () => ({
        kind: "range" as const,
        after: { ...head, cursor: 11 },
        head: { ...head, cursor: 12 },
      }),
    },
  };
  expect(errorOf(await activateDelivery(input, expired))).toBe(
    "RESYNC_REQUIRED",
  );
});
