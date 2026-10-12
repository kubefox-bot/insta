import { expect, test } from "bun:test";
import { deliveryNamespace } from "../../apps/be-insta/src/domains/conversations/adapters/dragonfly/delivery/conts";
import { createDragonflyDeliveryStreams } from "../../apps/be-insta/src/domains/conversations/adapters/dragonfly/delivery/create";
import { cleanupResources } from "../../scripts/testing/cleanup";
import type { OwnedResource } from "../../scripts/testing/types";
import { bootstrapDeliveryBroker } from "../fixtures/delivery/bootstrap";
import { docker } from "../fixtures/docker";
import { startBroker } from "../fixtures/isolated-broker";

test("explicit cursor append is durable and repeated response-loss retry does not add another entry", async () => {
  const name = `insta-chat03-${crypto.randomUUID()}`;
  await docker("volume", "create", "--label", `insta.testRunId=${name}`, name);
  const resources: OwnedResource[] = [{ kind: "volume", id: name }];
  try {
    const { client } = await startBroker(name, resources);
    try {
      await bootstrapDeliveryBroker(client);
      const streams = createDragonflyDeliveryStreams({
        namespace: deliveryNamespace,
        client,
        openReader: () => client.duplicate(),
        clock: Date.now,
      });
      const stream = { kind: "conversation" as const, id: "one" };
      const position = {
        streamId: "conversation:one",
        epoch: "00000000-0000-4000-8000-000000000001",
        cursor: 0,
      };
      const lease = await streams.acquire({ stream });
      await streams.begin({ lease, after: position });
      const eventId = "00000000-0000-4000-8000-000000000002";
      const event = {
        ...position,
        cursor: 1,
        eventId,
        eventType: "conversations.unread.changed",
        source: { kind: "message", eventId },
        createdAt: 100,
        recordedAt: 100,
        expiresAt: Date.now() + 86400000,
        payload: {
          version: 1,
          kind: "event",
          type: "conversations.unread.changed",
          eventId,
          occurredAt: "2026-10-20T00:00:00.000Z",
          meta: { requestId: eventId },
          data: { conversationId: "one" },
        },
      } as const;
      expect(await streams.append({ lease, event })).toBe("appended");
      expect(await streams.append({ lease, event })).toBe("duplicate");
      await streams.release({ lease });
    } finally {
      client.close();
    }
  } finally {
    await cleanupResources({ testRunId: name, resources, execute: docker });
  }
}, 60000);

import { waitUntil } from "../fixtures/barrier";
import {
  baseline,
  delivery,
  stream,
  withDeliveryBroker,
} from "../fixtures/delivery/broker";

test(
  "gap and partial restore never become ready; exact retained floor preserves the live suffix",
  () =>
    withDeliveryBroker(async ({ streams }) => {
      const lease = await streams.acquire({ stream });
      await streams.begin({ lease, after: baseline });
      const first = delivery(1);
      const second = delivery(2);
      expect(await streams.append({ lease, event: second })).toBe("gap");
      await streams.append({ lease, event: first });
      expect(await streams.read({ after: baseline, limit: 64 })).toEqual({
        kind: "gap",
      });
      await expect(
        streams.publishReady({
          lease,
          head: { ...baseline, cursor: 2 },
          expiresAt: second.expiresAt,
        }),
      ).rejects.toThrow("DELIVERY_RANGE_INCOMPLETE");
      await streams.append({ lease, event: second });
      await streams.publishReady({
        lease,
        head: { ...baseline, cursor: 2 },
        expiresAt: second.expiresAt,
      });
      const page = await streams.read({ after: baseline, limit: 64 });
      expect(page.kind).toBe("page");
      if (page.kind === "page")
        expect(page.events.map((event) => event.cursor)).toEqual([1, 2]);
      await streams.begin({ lease, after: { ...baseline, cursor: 1 } });
      await streams.publishReady({
        lease,
        head: { ...baseline, cursor: 2 },
        expiresAt: second.expiresAt,
      });
      expect(await streams.read({ after: baseline, limit: 64 })).toEqual({
        kind: "gap",
      });
      const retained = await streams.read({
        after: { ...baseline, cursor: 1 },
        limit: 64,
      });
      if (retained.kind !== "page") throw new Error("Missing retained suffix");
      expect(retained.events.map((event) => event.cursor)).toEqual([2]);
      await streams.release({ lease });
    }),
  60000,
);

test(
  "watch lifetime owns one blocking reader per active stream and wakes on missing ready keys without another event",
  () =>
    withDeliveryBroker(async ({ streams, client }) => {
      const lease = await streams.acquire({ stream });
      await streams.begin({ lease, after: baseline });
      await streams.publishReady({
        lease,
        head: baseline,
        expiresAt: Date.now() + 86400000,
      });
      await streams.release({ lease });
      const first = new AbortController();
      const second = new AbortController();
      let settled = false;
      const notices: string[] = [];
      const one = streams
        .watch({
          stream,
          after: baseline,
          signal: first.signal,
          onAvailable: async (notice) => {
            notices.push(notice.kind);
          },
        })
        .then(() => {
          settled = true;
        });
      await Promise.resolve();
      await Promise.resolve();
      expect(settled).toBe(false);
      const two = streams.watch({
        stream,
        after: baseline,
        signal: second.signal,
        onAvailable: async () => {},
      });
      await waitUntil({
        check: async () =>
          String(await client.send("CLIENT", ["LIST"]))
            .split("\n")
            .filter((line) => / flags=[a-z]*b/.test(line)).length === 1,
      });
      const keys = await client.send("KEYS", [
        "conversations:delivery:*:state",
      ]);
      if (!Array.isArray(keys)) throw new Error("Missing state keys");
      await client.send("DEL", keys.map(String));
      await waitUntil({
        check: () => Promise.resolve(notices.includes("integrity-lost")),
      });
      first.abort();
      await one;
      expect(String(await client.send("CLIENT", ["LIST"]))).toContain(
        "flags=b",
      );
      second.abort();
      await two;
      await waitUntil({
        check: async () =>
          String(await client.send("CLIENT", ["LIST"]))
            .split("\n")
            .filter((line) => / flags=[a-z]*b/.test(line)).length === 0,
      });
      expect(
        String(await client.send("CLIENT", ["LIST"]))
          .split("\n")
          .filter((line) => / flags=[a-z]*b/.test(line)),
      ).toHaveLength(0);
    }),
  60000,
);

import { restoreDeliveryStream } from "../../apps/be-insta/src/domains/conversations/use-cases/delivery/restore";
import { retainedJournal } from "../fixtures/delivery/journal";

test(
  "restore includes an already-published tail without a new event and resumes retained range above one",
  () =>
    withDeliveryBroker(async ({ streams, client }) => {
      const rows = [delivery(9), delivery(10)];
      const journal = retainedJournal(rows);
      const restored = await restoreDeliveryStream(
        { after: { ...baseline, cursor: 9 } },
        { journal, streams, clock: Date.now },
      );
      expect(restored).toEqual({ ...baseline, cursor: 10 });
      const page = await streams.read({
        after: { ...baseline, cursor: 9 },
        limit: 64,
      });
      if (page.kind !== "page") throw new Error("Tail not restored");
      expect(page.events.map((event) => event.cursor)).toEqual([10]);
      const keys = await client.send("KEYS", [
        "conversations:delivery:*:entries",
      ]);
      if (!Array.isArray(keys)) throw new Error("Missing entries");
      await client.send("DEL", keys.map(String));
      expect(
        await streams.read({ after: { ...baseline, cursor: 9 }, limit: 64 }),
      ).toEqual({ kind: "gap" });
      expect(
        await restoreDeliveryStream(
          { after: { ...baseline, cursor: 9 } },
          { journal, streams, clock: Date.now },
        ),
      ).toEqual({ ...baseline, cursor: 10 });
      const replay = await streams.read({
        after: { ...baseline, cursor: 8 },
        limit: 64,
      });
      if (replay.kind !== "page") throw new Error("Missing range");
      expect(replay.events.map((event) => event.cursor)).toEqual([9, 10]);
    }),
  60000,
);

test(
  "lost append response and Lua failure after XADD preserve effects without a false ready watermark",
  () =>
    withDeliveryBroker(async ({ streams, client }) => {
      const lease = await streams.acquire({ stream });
      await streams.begin({ lease, after: baseline });
      const event = delivery(1);
      let lost = true;
      const uncertain = createDragonflyDeliveryStreams({
        namespace: deliveryNamespace,
        client: {
          get: (key) => client.get(key),
          send: async (command, args) => {
            const result = await client.send(command, args);
            if (result === "appended" && lost) {
              lost = false;
              throw new Error("response lost after persisted append");
            }
            return result;
          },
        },
        openReader: () => client.duplicate(),
        clock: Date.now,
      });
      await expect(uncertain.append({ lease, event })).rejects.toThrow(
        "response lost",
      );
      expect(await streams.append({ lease, event })).toBe("duplicate");
      const second = delivery(2);
      const partial = createDragonflyDeliveryStreams({
        namespace: deliveryNamespace,
        client: {
          get: (key) => client.get(key),
          send: async (command, args) => {
            const [script, ...rest] = args;
            if (command === "EVAL" && script?.includes("redis.call('XADD'"))
              return client.send(command, [
                script.replace(
                  "redis.call('HSET',KEYS[3],'tail',ARGV[5])",
                  "error('injected failure after XADD')",
                ),
                ...rest,
              ]);
            return client.send(command, args);
          },
        },
        openReader: () => client.duplicate(),
        clock: Date.now,
      });
      await expect(partial.append({ lease, event: second })).rejects.toThrow(
        "injected failure",
      );
      const keys = await client.send("KEYS", [
        "conversations:delivery:*:entries",
      ]);
      if (!Array.isArray(keys) || !keys[0]) throw new Error("Missing stream");
      expect(await client.send("XLEN", [String(keys[0])])).toBe(2);
      expect(await streams.read({ after: baseline, limit: 64 })).toEqual({
        kind: "gap",
      });
      await expect(
        streams.publishReady({
          lease,
          head: { ...baseline, cursor: 2 },
          expiresAt: second.expiresAt,
        }),
      ).rejects.toThrow("DELIVERY_RANGE_INCOMPLETE");
      await streams.release({ lease });
      expect(
        await restoreDeliveryStream(
          { after: baseline },
          {
            journal: retainedJournal([event, second]),
            streams,
            clock: Date.now,
          },
        ),
      ).toEqual({ ...baseline, cursor: 2 });
      await uncertain.close();
      await partial.close();
    }),
  60000,
);

test(
  "two independent runtime readers receive the same stream event and stale lease cannot publish",
  () =>
    withDeliveryBroker(async ({ streams, client }) => {
      const lease = await streams.acquire({ stream });
      await streams.begin({ lease, after: baseline });
      await streams.publishReady({
        lease,
        head: baseline,
        expiresAt: Date.now() + 86400000,
      });
      await streams.release({ lease });
      const other = createDragonflyDeliveryStreams({
        namespace: deliveryNamespace,
        client,
        openReader: () => client.duplicate(),
        clock: Date.now,
      });
      const controllers = [new AbortController(), new AbortController()];
      const seen = [[] as number[], [] as number[]];
      const readers = [streams, other].map((adapter, index) => {
        const controller = controllers[index];
        const target = seen[index];
        if (!controller || !target) throw new Error("Missing reader fixture");
        return adapter.watch({
          stream,
          after: baseline,
          signal: controller.signal,
          onAvailable: async () => {
            const page = await adapter.read({ after: baseline, limit: 64 });
            if (page.kind === "page")
              target.push(...page.events.map((event) => event.cursor));
          },
        });
      });
      try {
        await waitUntil({
          check: async () =>
            String(await client.send("CLIENT", ["LIST"]))
              .split("\n")
              .filter((line) => / flags=[a-z]*b/.test(line)).length === 2,
        });
        const current = await streams.acquire({ stream });
        const event = delivery(1);
        await streams.append({ lease: current, event });
        await streams.publishReady({
          lease: current,
          head: { ...baseline, cursor: 1 },
          expiresAt: event.expiresAt,
        });
        await waitUntil({
          check: () => Promise.resolve(seen.every((rows) => rows.includes(1))),
        });
        expect(seen).toEqual([[1], [1]]);
        await expect(
          streams.append({ lease, event: delivery(2) }),
        ).rejects.toThrow("DELIVERY_LEASE_STALE");
        await streams.release({ lease: current });
      } finally {
        for (const controller of controllers) controller.abort();
        await Promise.all(readers);
        await other.close();
      }
    }),
  60000,
);

import { materializeDelivery } from "../../apps/be-insta/src/domains/conversations/use-cases/delivery/materialize";

test(
  "receipt source arriving before message source fills canonical cursor order and expired recovery creates no stream",
  () =>
    withDeliveryBroker(async ({ streams, client }) => {
      const message = delivery(1);
      const baseReceipt = delivery(2);
      const receipt = {
        ...baseReceipt,
        eventType: "messages.receipts.updated" as const,
        source: { kind: "receipt" as const, eventId: baseReceipt.eventId },
        payload: {
          ...baseReceipt.payload,
          type: "messages.receipts.updated" as const,
          data: {
            conversationId: "one",
            receipts: [
              {
                messageId: "one",
                recipientId: "bob",
                sequence: 1,
                deliveredAt: "2026-10-20T00:00:00.000Z",
                readAt: null,
              },
            ],
          },
        },
      };
      const journal = retainedJournal([message, receipt]);
      await materializeDelivery(
        { source: receipt.source },
        { journal, streams, clock: Date.now },
      );
      await materializeDelivery(
        { source: message.source },
        { journal, streams, clock: Date.now },
      );
      const page = await streams.read({ after: baseline, limit: 64 });
      if (page.kind !== "page") throw new Error("Missing ordered sources");
      expect(page.events.map((event) => event.cursor)).toEqual([1, 2]);
      expect(page.events[1]?.source.kind).toBe("receipt");
      const before = await client.send("DBSIZE", []);
      expect(
        await materializeDelivery(
          { source: message.source },
          { journal, streams, clock: () => message.expiresAt },
        ),
      ).toEqual({ kind: "expired" });
      expect(await client.send("DBSIZE", [])).toBe(before);
    }),
  60000,
);

test(
  "fully trimmed retained range remains ready and a future cursor remains a gap",
  () =>
    withDeliveryBroker(async ({ streams }) => {
      const lease = await streams.acquire({ stream });
      await streams.begin({ lease, after: baseline });
      const event = delivery(1);
      await streams.append({ lease, event });
      await streams.publishReady({
        lease,
        head: { ...baseline, cursor: 1 },
        expiresAt: event.expiresAt,
      });
      await streams.begin({ lease, after: { ...baseline, cursor: 1 } });
      await streams.publishReady({
        lease,
        head: { ...baseline, cursor: 1 },
        expiresAt: event.expiresAt,
      });
      expect(
        await streams.read({ after: { ...baseline, cursor: 1 }, limit: 64 }),
      ).toEqual({ kind: "page", head: { ...baseline, cursor: 1 }, events: [] });
      expect(
        await streams.read({ after: { ...baseline, cursor: 2 }, limit: 64 }),
      ).toEqual({ kind: "gap" });
      await streams.release({ lease });
    }),
  60000,
);

for (const priorReady of [false, true])
  test(
    `crash before ready retains canonical tail expiry (prior ready ${priorReady})`,
    () =>
      withDeliveryBroker(async ({ streams, client }) => {
        const first = { ...delivery(1), expiresAt: Date.now() + 21600000 };
        const last = { ...delivery(2), expiresAt: Date.now() + 86400000 };
        const lease = await streams.acquire({ stream });
        await streams.begin({ lease, after: baseline });
        await streams.append({ lease, event: first });
        if (priorReady)
          await streams.publishReady({
            lease,
            head: { ...baseline, cursor: 1 },
            expiresAt: first.expiresAt,
          });
        await streams.append({ lease, event: last });
        await streams.release({ lease });
        expect(
          await restoreDeliveryStream(
            { after: baseline },
            {
              journal: retainedJournal([first, last]),
              streams,
              clock: Date.now,
            },
          ),
        ).toEqual({ ...baseline, cursor: 2 });
        const keys = await client.send("KEYS", [
          "conversations:delivery:*:state",
        ]);
        if (!Array.isArray(keys) || keys.length !== 1)
          throw new Error("Missing state");
        const key = String(keys[0]);
        expect(await client.send("HGET", [key, "expiry"])).toBe(
          String(last.expiresAt),
        );
        expect(Number(await client.send("PTTL", [key]))).toBeGreaterThan(
          23 * 3600000,
        );
        expect(
          Number(
            await client.send("PTTL", [key.replace(/:state$/, ":entries")]),
          ),
        ).toBeGreaterThan(23 * 3600000);
      }),
    60000,
  );

for (const shutdownDuringReplacement of [true, false])
  test(
    `replacement reader respects closed lifetime and shares one owner (shutdown ${shutdownDuringReplacement})`,
    () =>
      withDeliveryBroker(async ({ client }) => {
        const entered = Promise.withResolvers<void>();
        const release = Promise.withResolvers<void>();
        let opens = 0;
        const adapter = createDragonflyDeliveryStreams({
          client,
          namespace: deliveryNamespace,
          clock: Date.now,
          openReader: async () => {
            opens += 1;
            if (opens === 1) {
              entered.resolve();
              await release.promise;
            }
            return client.duplicate();
          },
        });
        const first = new AbortController();
        const replacements = [new AbortController(), new AbortController()];
        const watch = (signal: AbortSignal) =>
          adapter.watch({
            stream,
            after: baseline,
            signal,
            onAvailable: async () => {},
          });
        const old = watch(first.signal);
        await entered.promise;
        first.abort();
        const pending = replacements.map((control) =>
          watch(control.signal).then(
            () => "settled",
            (error) => (error instanceof Error ? error.message : "failed"),
          ),
        );
        const closed = shutdownDuringReplacement ? adapter.close() : undefined;
        release.resolve();
        await old;
        if (closed) await closed;
        else await waitUntil({ check: () => Promise.resolve(opens === 2) });
        for (const control of replacements) control.abort();
        const outcomes = await Promise.all(pending);
        await adapter.close();
        expect(opens).toBe(shutdownDuringReplacement ? 1 : 2);
        expect(outcomes).toEqual(
          shutdownDuringReplacement
            ? ["Delivery readers closed", "Delivery readers closed"]
            : ["settled", "settled"],
        );
        expect(
          String(await client.send("CLIENT", ["LIST"]))
            .trim()
            .split("\n"),
        ).toHaveLength(1);
      }),
    60000,
  );
