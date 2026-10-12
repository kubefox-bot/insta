import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { createDeliverySubscriptions } from "../../../src/domains/conversations/use-cases/delivery/subscriptions";
import type { Actor } from "../../../src/domains/users/index";
import { errorOf, expectSuccess } from "../../fixtures/realtime/outcome";

const actor = {
  userId: "alice",
  backendSessionId: "s",
  username: "Alice",
  accessExpiresAt: 100000,
} as Actor;
const signal = new AbortController().signal;
const policy = {
  retentionMs: 100000,
  ackTimeoutMs: 20,
  replayPageSize: 64,
  maxUnreadBatchSize: 64,
  maxApplyFailures: 5,
  deliveryRetryBaseMs: 1000,
  deliveryRetryCapMs: 30000,
  maxSubscriptionsPerSocket: 6,
};
const setup = () => ({
  actor,
  ports: {
    clock: () => 0,
    uuid: () => crypto.randomUUID(),
    random: () => 0,
    policy,
    authorize: async () => Result.Ok(actor),
    membership: { permits: async () => true },
    journal: {
      head: async ({ stream }: { stream: { kind: string; id: string } }) => ({
        streamId: `${stream.kind}:${stream.id}`,
        epoch: "e",
        cursor: 0,
      }),
      range: async ({ stream }: { stream: { kind: string; id: string } }) => ({
        kind: "range" as const,
        after: {
          streamId: `${stream.kind}:${stream.id}`,
          epoch: "e",
          cursor: 0,
        },
        head: {
          streamId: `${stream.kind}:${stream.id}`,
          epoch: "e",
          cursor: 0,
        },
      }),
    },
    recover: async () => "ready" as const,
    streams: {
      read: async ({
        after,
      }: {
        after: { streamId: string; epoch: string; cursor: number };
      }) => ({ kind: "page" as const, events: [], head: after }),
      watch: async ({ signal }: { signal: AbortSignal }) => {
        if (!signal.aborted)
          await new Promise<void>((resolve) =>
            signal.addEventListener("abort", () => resolve(), { once: true }),
          );
      },
    },
    target: {
      send: async () => ({ kind: "timeout" as const }),
      notify: async () => "received" as const,
    },
    wait: async ({ signal }: { signal: AbortSignal }) => {
      signal.throwIfAborted();
    },
  },
});

test("lost prepare ACK reuses exact paused token; max6 remains and unsubscribe frees one slot", async () => {
  const owner = createDeliverySubscriptions(setup());
  const target = { kind: "conversation" as const, id: "c" };
  try {
    const first = await owner.prepare({ target, signal });
    expect(first.isOk()).toBe(true);
    expect(expectSuccess(await owner.prepare({ target, signal }))).toEqual(
      expectSuccess(first),
    );
    const foreign = await owner.prepare({
      target,
      after: { streamId: "conversation:foreign", epoch: "e", cursor: 0 },
      signal,
    });
    expect(errorOf(foreign)).toBe("FORBIDDEN");
    for (let index = 0; index < 5; index++)
      expect(
        (
          await owner.prepare({
            target: { ...target, id: `c${index}` },
            signal,
          })
        ).isOk(),
      ).toBe(true);
    expect(
      errorOf(
        await owner.prepare({ target: { ...target, id: "overflow" }, signal }),
      ),
    ).toBe("RATE_LIMITED");
    await owner.remove(target);
    const next = await owner.prepare({ target, signal });
    expect(next.isOk()).toBe(true);
    expect(expectSuccess(next).subscriptionId).not.toBe(
      expectSuccess(first).subscriptionId,
    );
  } finally {
    await owner.close();
  }
});

test("unsubscribe waits active reader settlement before releasing slot; altered activation fails", async () => {
  const fixture = setup();
  const started = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  const owner = createDeliverySubscriptions({
    ...fixture,
    ports: {
      ...fixture.ports,
      streams: {
        ...fixture.ports.streams,
        watch: async () => {
          started.resolve();
          await released.promise;
        },
      },
    },
  });
  const target = { kind: "conversation" as const, id: "c" };
  try {
    const prepared = expectSuccess(await owner.prepare({ target, signal }));
    expect(
      errorOf(
        await owner.activate({
          ...prepared,
          baseline: { ...prepared.baseline, cursor: 1 },
          signal,
        }),
      ),
    ).toBe("RESYNC_REQUIRED");
    expect((await owner.activate({ ...prepared, signal })).isOk()).toBe(true);
    await started.promise;
    let finished = false;
    const closing = owner.remove(target).then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    released.resolve();
    await closing;
    const next = expectSuccess(await owner.prepare({ target, signal }));
    expect(next.subscriptionId).not.toBe(prepared.subscriptionId);
  } finally {
    released.resolve();
    await owner.close();
  }
});

test("activate installs owned recovery without waiting for physical readiness; unsubscribe awaits its actual settlement", async () => {
  const fixture = setup();
  const started = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  let recoverySignal: AbortSignal | undefined;
  let readers = 0;
  const owner = createDeliverySubscriptions({
    ...fixture,
    ports: {
      ...fixture.ports,
      recover: async ({ signal }) => {
        recoverySignal = signal;
        started.resolve();
        await released.promise;
        signal.throwIfAborted();
        return "ready";
      },
      streams: {
        ...fixture.ports.streams,
        watch: async () => {
          readers++;
        },
      },
    },
  });
  const target = { kind: "conversation" as const, id: "restoring" };
  try {
    const prepared = expectSuccess(await owner.prepare({ target, signal }));
    expect((await owner.activate({ ...prepared, signal })).isOk()).toBe(true);
    await started.promise;
    expect(
      (
        await owner.prepare({ target: { ...target, id: "neighbor" }, signal })
      ).isOk(),
    ).toBe(true);
    let settled = false;
    const closing = owner.remove(target).then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(recoverySignal?.aborted).toBe(true);
    expect(settled).toBe(false);
    expect(readers).toBe(0);
    released.resolve();
    await closing;
    const next = expectSuccess(await owner.prepare({ target, signal }));
    expect(next.subscriptionId).not.toBe(prepared.subscriptionId);
    released.resolve();
    expect(expectSuccess(await owner.prepare({ target, signal }))).toEqual(
      next,
    );
  } finally {
    released.resolve();
    await owner.close();
  }
});
