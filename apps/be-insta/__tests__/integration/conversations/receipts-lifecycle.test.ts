import { expect, test } from "bun:test";
import { createCommitReceipts } from "../../../src/domains/conversations/adapters/mongo/receipts/commit";
import { createMongoReceiptOutbox } from "../../../src/domains/conversations/adapters/mongo/receipts/outbox";
import { startReceiptWorker } from "../../../src/domains/conversations/adapters/ws/receipts/worker";
import { dispatchReceiptOutbox } from "../../../src/domains/conversations/use-cases/receipts/dispatch-outbox";
import { createReceiptFixture } from "../../fixtures/receipts/mongo";

for (const mode of ["shutdown", "timeout"] as const)
  test(`receipt ${mode} retains pending lease until publication cleanup and recovers afterwards`, async () => {
    const f = await createReceiptFixture();
    const cleanup = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const aborted = Promise.withResolvers<void>();
    const errors: string[] = [];
    try {
      const result = await createCommitReceipts(f)({
        actorId: f.bob,
        conversationId: f.conversationId,
        messageIds: f.ids.slice(0, 1),
        status: "read",
        nowMs: Date.now(),
      });
      expect(result.isOk()).toBe(true);
      const outbox = createMongoReceiptOutbox(f);
      const publish = async ({ signal }: Readonly<{ signal: AbortSignal }>) => {
        signal.addEventListener("abort", () => aborted.resolve(), {
          once: true,
        });
        started.resolve();
        await cleanup.promise;
      };
      const operation =
        mode === "shutdown"
          ? startReceiptWorker({
              outbox,
              publish,
              onError: () => {
                errors.push("worker");
              },
            })
          : {
              close: () =>
                dispatchReceiptOutbox({
                  outbox,
                  publish,
                  clock: Date.now,
                  uuid: () => crypto.randomUUID(),
                }),
            };
      const pending = mode === "timeout" ? operation.close() : undefined;
      if (mode === "shutdown") await started.promise;
      let returned = false;
      const closing = (pending ?? operation.close()).finally(() => {
        returned = true;
      });
      const watchdog = setTimeout(() => {
        cleanup.resolve();
        aborted.reject(new Error("Missing abort barrier"));
      }, 15000);
      try {
        await started.promise;
        await aborted.promise;
        expect(returned).toBe(false);
        const held = await f.db
          .collection("conversations_receipt_outbox")
          .findOne({});
        expect(held?.state).toBe("pending");
        expect(held?.leaseUntil).toBeGreaterThan(Date.now());
        cleanup.resolve();
        await closing;
        const settled = await f.db
          .collection("conversations_receipt_outbox")
          .findOne({});
        expect(settled?.state).toBe("pending");
        expect(settled?.leaseUntil).toBe(0);
        expect(settled?.publishedAt).toBeUndefined();
        const now = Date.now() + 2000;
        const resumed = createMongoReceiptOutbox(f);
        const claim = await resumed.claim({
          now,
          leaseId: crypto.randomUUID(),
        });
        expect(claim?.event.eventId).toBe(held?.eventId);
        if (!claim) throw new Error("Missing durable retry");
        expect(await resumed.complete({ ...claim, now })).toBe(true);
        expect(errors).toEqual([]);
      } finally {
        clearTimeout(watchdog);
        cleanup.resolve();
        await closing;
      }
    } finally {
      cleanup.resolve();
      await f.close();
    }
  }, 20000);
