import { expect, test } from "bun:test";
import {
  baseline,
  delivery,
  stream,
  withDeliveryBroker,
} from "../fixtures/delivery/broker";

test(
  "idle retention removes only expired prefix and preserves live deadline",
  () =>
    withDeliveryBroker(async ({ streams, client }) => {
      const nowMs = Date.now();
      const first = { ...delivery(1), expiresAt: nowMs + 10000 };
      const last = { ...delivery(2), expiresAt: nowMs + 86400000 };
      const lease = await streams.acquire({ stream });
      await streams.begin({ lease, after: baseline });
      await streams.append({ lease, event: first });
      await streams.append({ lease, event: last });
      await streams.publishReady({
        lease,
        head: { ...baseline, cursor: 2 },
        expiresAt: last.expiresAt,
      });
      await streams.release({ lease });
      const prefix = `conversations:delivery:${lease.generation}:conversation:one`;
      await client.send("SET", ["auth:protected", "retained"]);
      await client.send("SET", [`${prefix}:unknown`, "retained"]);
      await streams.retain({ nowMs: first.expiresAt });
      expect(await client.send("XLEN", [`${prefix}:entries`])).toBe(1);
      expect(await streams.inspect({ after: baseline })).toEqual({
        kind: "ready",
        generation: lease.generation,
        after: { ...baseline, cursor: 1 },
        head: { ...baseline, cursor: 2 },
      });
      expect(
        await client.send("HMGET", [
          `${prefix}:state`,
          "base",
          "tail",
          "ready",
          "expiry",
        ]),
      ).toEqual(["1", "2", "2", String(last.expiresAt)]);
      expect(await client.send("GET", ["auth:protected"])).toBe("retained");
      expect(await client.send("GET", [`${prefix}:unknown`])).toBe("retained");
    }),
  60000,
);

import { deliveryNamespace } from "../../apps/be-insta/src/domains/conversations/adapters/dragonfly/delivery/conts";
import { createDragonflyDeliveryStreams } from "../../apps/be-insta/src/domains/conversations/adapters/dragonfly/delivery/create";
import { seedRetentionStream } from "../fixtures/delivery/retention";

test(
  "retention skips busy lease, bounds rows and never marks a partial restore ready",
  () =>
    withDeliveryBroker(async ({ streams, client }) => {
      const nowMs = Date.now() + 10000;
      const owned = await seedRetentionStream({
        streams,
        count: 66,
        expiresAt: (cursor) => (cursor < 66 ? nowMs : nowMs + 86400000),
        ready: false,
      });
      const lease = await streams.acquire({ stream });
      await streams.retain({ nowMs });
      expect(await client.send("XLEN", [`${owned.prefix}:entries`])).toBe(66);
      await streams.release({ lease });
      await streams.retain({ nowMs });
      expect(await client.send("XLEN", [`${owned.prefix}:entries`])).toBe(2);
      expect(
        await client.send("HMGET", [
          `${owned.prefix}:state`,
          "base",
          "tail",
          "ready",
          "complete",
        ]),
      ).toEqual(["64", "66", "0", "0"]);
      expect(await streams.inspect({ after: baseline })).toEqual({
        kind: "gap",
      });
      await streams.retain({ nowMs });
      expect(await client.send("XLEN", [`${owned.prefix}:entries`])).toBe(1);
      expect(await client.send("HGET", [`${owned.prefix}:state`, "base"])).toBe(
        "65",
      );
      expect(await client.send("GET", [`${owned.prefix}:lease`])).toBeNull();
    }),
  60000,
);

test(
  "fully expired complete range keeps base tail and ready equal without extending deadline",
  () =>
    withDeliveryBroker(async ({ streams, client }) => {
      const nowMs = Date.now() + 10000;
      const owned = await seedRetentionStream({
        streams,
        expiresAt: () => nowMs,
      });
      const deadline = await client.send("HGET", [
        `${owned.prefix}:state`,
        "expiry",
      ]);
      await streams.retain({ nowMs });
      expect(await client.send("XLEN", [`${owned.prefix}:entries`])).toBe(0);
      expect(
        await client.send("HMGET", [
          `${owned.prefix}:state`,
          "base",
          "tail",
          "ready",
          "complete",
          "expiry",
        ]),
      ).toEqual(["2", "2", "2", "1", deadline]);
      expect(
        await streams.read({ after: { ...baseline, cursor: 2 }, limit: 64 }),
      ).toEqual({ kind: "page", head: { ...baseline, cursor: 2 }, events: [] });
    }),
  60000,
);

test(
  "failed Lua after persisted XTRIM is observable as a gap and still releases lease",
  () =>
    withDeliveryBroker(async ({ streams, client }) => {
      const nowMs = Date.now() + 10000;
      const owned = await seedRetentionStream({
        streams,
        expiresAt: (cursor) => (cursor === 1 ? nowMs : nowMs + 86400000),
      });
      const broken = createDragonflyDeliveryStreams({
        namespace: deliveryNamespace,
        clock: Date.now,
        openReader: () => client.duplicate(),
        client: {
          get: (key) => client.get(key),
          send: (command, args) => {
            const [script, ...rest] = args;
            if (
              command === "EVAL" &&
              script?.includes("DELIVERY_RETENTION_CHANGED")
            )
              return client.send(command, [
                script.replace(
                  /redis\.call\('HSET',KEYS\[3\],'base',[^\n]+\)/,
                  "error('failure after XTRIM')",
                ),
                ...rest,
              ]);
            return client.send(command, args);
          },
        },
      });
      try {
        await expect(broken.retain({ nowMs })).rejects.toThrow(
          "failure after XTRIM",
        );
        expect(await client.send("XLEN", [`${owned.prefix}:entries`])).toBe(1);
        expect(
          await client.send("HGET", [`${owned.prefix}:state`, "base"]),
        ).toBe("0");
        expect(await streams.inspect({ after: baseline })).toEqual({
          kind: "gap",
        });
        expect(await client.send("GET", [`${owned.prefix}:lease`])).toBeNull();
      } finally {
        await broken.close();
      }
    }),
  60000,
);

test(
  "SCAN remainder drains before another page and invalid oversized page is rejected",
  () =>
    withDeliveryBroker(async ({ streams, client }) => {
      const nowMs = Date.now() + 10000;
      const owned: Awaited<ReturnType<typeof seedRetentionStream>>[] = [];
      for (let index = 0; index < 33; index += 1)
        owned.push(
          await seedRetentionStream({
            streams,
            id: `bounded-${index}`,
            expiresAt: (cursor) => (cursor === 1 ? nowMs : nowMs + 86400000),
          }),
        );
      let scans = 0;
      const bounded = createDragonflyDeliveryStreams({
        namespace: deliveryNamespace,
        clock: Date.now,
        openReader: () => client.duplicate(),
        client: {
          get: (key) => client.get(key),
          send: async (command, args) => {
            if (command === "SCAN") {
              scans += 1;
              return ["0", owned.map((row) => `${row.prefix}:state`)];
            }
            return client.send(command, args);
          },
        },
      });
      try {
        for (const expected of [16, 32, 33]) {
          await bounded.retain({ nowMs });
          const sizes = await Promise.all(
            owned.map((row) => client.send("XLEN", [`${row.prefix}:entries`])),
          );
          expect(sizes.filter((size) => size === 1)).toHaveLength(expected);
          expect(scans).toBe(1);
        }
      } finally {
        await bounded.close();
      }
      const oversized = createDragonflyDeliveryStreams({
        namespace: deliveryNamespace,
        clock: Date.now,
        openReader: () => client.duplicate(),
        client: {
          get: (key) => client.get(key),
          send: (command, args) =>
            command === "SCAN"
              ? Promise.resolve([
                  "0",
                  Array.from({ length: 4097 }, () => "unknown"),
                ])
              : client.send(command, args),
        },
      });
      try {
        await expect(oversized.retain({ nowMs })).rejects.toThrow();
      } finally {
        await oversized.close();
      }
    }),
  60000,
);

test(
  "retention rejects stale generation on write and resets saved scan progress",
  () =>
    withDeliveryBroker(async ({ streams, client }) => {
      const nowMs = Date.now() + 10000;
      const owned = await seedRetentionStream({
        streams,
        expiresAt: (cursor) => (cursor === 1 ? nowMs : nowMs + 86400000),
      });
      const replacement = `${owned.generation.slice(0, 40)}:${crypto.randomUUID()}`;
      let changed = false;
      const stale = createDragonflyDeliveryStreams({
        namespace: deliveryNamespace,
        clock: Date.now,
        openReader: () => client.duplicate(),
        client: {
          get: (key) => client.get(key),
          send: async (command, args) => {
            const [script] = args;
            if (
              !changed &&
              command === "EVAL" &&
              script?.includes("DELIVERY_RETENTION_CHANGED")
            ) {
              changed = true;
              await client.send("SET", [
                deliveryNamespace.generationKey,
                replacement,
              ]);
            }
            return client.send(command, args);
          },
        },
      });
      try {
        await expect(stale.retain({ nowMs })).rejects.toThrow();
        expect(changed).toBe(true);
        expect(await client.send("XLEN", [`${owned.prefix}:entries`])).toBe(2);
        await stale.retain({ nowMs });
        expect(await client.send("XLEN", [`${owned.prefix}:entries`])).toBe(2);
        expect(
          await client.send("GET", [deliveryNamespace.generationKey]),
        ).toBe(replacement);
      } finally {
        await stale.close();
      }
    }),
  60000,
);

test(
  "cancelled retention awaits actual read and owned lease release",
  () =>
    withDeliveryBroker(async ({ streams, client }) => {
      const nowMs = Date.now() + 10000;
      const owned = await seedRetentionStream({
        streams,
        expiresAt: (cursor) => (cursor === 1 ? nowMs : nowMs + 86400000),
      });
      const entered = Promise.withResolvers<void>();
      const finish = Promise.withResolvers<void>();
      const controller = new AbortController();
      let settled = false;
      const delayed = createDragonflyDeliveryStreams({
        namespace: deliveryNamespace,
        clock: Date.now,
        openReader: () => client.duplicate(),
        client: {
          get: (key) => client.get(key),
          send: async (command, args) => {
            const result = await client.send(command, args);
            if (
              command === "EVAL" &&
              args[0]?.includes("return {m[1],m[2],m[3],redis.call('XRANGE'")
            ) {
              entered.resolve();
              await finish.promise;
            }
            return result;
          },
        },
      });
      const pending = delayed
        .retain({ nowMs, signal: controller.signal })
        .then(
          () => "success",
          () => "cancelled",
        )
        .finally(() => {
          settled = true;
        });
      try {
        await entered.promise;
        controller.abort();
        expect(settled).toBe(false);
        expect(
          await client.send("GET", [`${owned.prefix}:lease`]),
        ).not.toBeNull();
      } finally {
        finish.resolve();
      }
      expect(await pending).toBe("cancelled");
      expect(await client.send("GET", [`${owned.prefix}:lease`])).toBeNull();
      expect(await client.send("XLEN", [`${owned.prefix}:entries`])).toBe(2);
      await delayed.close();
    }),
  60000,
);

test(
  "empty scan pages are bounded and lease I/O failure is not treated as busy",
  () =>
    withDeliveryBroker(async ({ streams, client }) => {
      const nowMs = Date.now() + 10000;
      const owned = await seedRetentionStream({
        streams,
        expiresAt: (cursor) => (cursor === 1 ? nowMs : nowMs + 86400000),
      });
      const cursors: string[] = [];
      const pages = createDragonflyDeliveryStreams({
        namespace: deliveryNamespace,
        clock: Date.now,
        openReader: () => client.duplicate(),
        client: {
          get: (key) => client.get(key),
          send: (command, args) => {
            if (command === "SCAN") {
              cursors.push(String(args[0]));
              return Promise.resolve([String(cursors.length), []]);
            }
            return client.send(command, args);
          },
        },
      });
      try {
        await pages.retain({ nowMs });
        expect(cursors).toEqual(["0", "1", "2", "3"]);
        await pages.retain({ nowMs });
        expect(cursors).toEqual(["0", "1", "2", "3", "4", "5", "6", "7"]);
      } finally {
        await pages.close();
      }
      const unavailable = createDragonflyDeliveryStreams({
        namespace: deliveryNamespace,
        clock: Date.now,
        openReader: () => client.duplicate(),
        client: {
          get: (key) => client.get(key),
          send: (command, args) => {
            if (command === "EVAL" && args[0]?.includes("'NX'"))
              return Promise.reject(new Error("lease I/O unavailable"));
            return client.send(command, args);
          },
        },
      });
      try {
        await expect(unavailable.retain({ nowMs })).rejects.toThrow(
          "lease I/O unavailable",
        );
        expect(await client.send("XLEN", [`${owned.prefix}:entries`])).toBe(2);
      } finally {
        await unavailable.close();
      }
    }),
  60000,
);

test(
  "trimming beyond previous ready makes appended partial tail unready",
  () =>
    withDeliveryBroker(async ({ streams, client }) => {
      const nowMs = Date.now() + 10000;
      const owned = await seedRetentionStream({
        streams,
        count: 1,
        expiresAt: () => nowMs,
      });
      const lease = await streams.acquire({ stream });
      await streams.append({
        lease,
        event: { ...delivery(2), expiresAt: nowMs },
      });
      await streams.append({
        lease,
        event: { ...delivery(3), expiresAt: nowMs + 86400000 },
      });
      await streams.release({ lease });
      await streams.retain({ nowMs });
      expect(
        await client.send("HMGET", [
          `${owned.prefix}:state`,
          "base",
          "tail",
          "ready",
          "complete",
        ]),
      ).toEqual(["2", "3", "1", "0"]);
      expect(await streams.inspect({ after: baseline })).toEqual({
        kind: "gap",
      });
    }),
  60000,
);

test(
  "late Lua failure after persisted base cannot expose a previous ready watermark",
  () =>
    withDeliveryBroker(async ({ streams, client }) => {
      const nowMs = Date.now() + 10000;
      const owned = await seedRetentionStream({
        streams,
        count: 1,
        expiresAt: () => nowMs,
      });
      const lease = await streams.acquire({ stream });
      await streams.append({
        lease,
        event: { ...delivery(2), expiresAt: nowMs },
      });
      await streams.append({
        lease,
        event: { ...delivery(3), expiresAt: nowMs + 86400000 },
      });
      await streams.release({ lease });
      const deadline = await client.send("HGET", [
        `${owned.prefix}:state`,
        "expiry",
      ]);
      const broken = createDragonflyDeliveryStreams({
        namespace: deliveryNamespace,
        clock: Date.now,
        openReader: () => client.duplicate(),
        client: {
          get: (key) => client.get(key),
          send: (command, args) => {
            const [script, ...rest] = args;
            if (
              command === "EVAL" &&
              script?.includes("DELIVERY_RETENTION_CHANGED")
            ) {
              const faulted = script.replace(
                /(redis\.call\('HSET',KEYS\[3\],'base',[^\n]+\))/,
                "$1\nerror('failure after base metadata')",
              );
              if (faulted === script)
                throw new Error("Missing base mutation fault point");
              return client.send(command, [faulted, ...rest]);
            }
            return client.send(command, args);
          },
        },
      });
      try {
        await expect(broken.retain({ nowMs })).rejects.toThrow(
          "failure after base metadata",
        );
        expect(await client.send("XLEN", [`${owned.prefix}:entries`])).toBe(1);
        expect(
          await client.send("HMGET", [
            `${owned.prefix}:state`,
            "base",
            "tail",
            "ready",
            "expiry",
          ]),
        ).toEqual(["2", "3", "1", deadline]);
        expect(await streams.inspect({ after: baseline })).toEqual({
          kind: "gap",
        });
        expect(
          await client.send("HGET", [`${owned.prefix}:state`, "complete"]),
        ).toBe("0");
        expect(await client.send("GET", [`${owned.prefix}:lease`])).toBeNull();
      } finally {
        await broken.close();
      }
    }),
  60000,
);
