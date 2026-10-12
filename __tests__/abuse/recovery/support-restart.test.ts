import { expect, test } from "bun:test";
import { supportCollectionNames } from "../../../apps/be-insta/src/domains/support-reports/adapters/mongo/collections";
import { submitReport } from "../../../apps/be-insta/src/domains/support-reports/use-cases/submit";
import { bootstrapGeneration } from "../../../apps/be-insta/src/lib/dragonfly/bootstrap";
import { readGeneration } from "../../../apps/be-insta/src/lib/dragonfly/index";
import { cleanupResources } from "../../../scripts/testing/cleanup";
import type { OwnedResource } from "../../../scripts/testing/types";
import { waitUntil } from "../../fixtures/barrier";
import { docker } from "../../fixtures/docker";
import { createMailObserver } from "../../fixtures/registration/mailpit";
import { restartConfig } from "../../fixtures/support/restart/config";
import { connectRestart } from "../../fixtures/support/restart/connect";
import {
  ownedContainerAction,
  startRestartProviders,
  startRestartWorker,
  waitMongo,
} from "../../fixtures/support/restart/providers";

test("A21 actual isolated Mongo broker and worker restart preserves pending and recovers one canonical report via Mailpit", async () => {
  const runId = `insta-auth06-${crypto.randomUUID()}`;
  const resources: OwnedResource[] = [];
  const startedAt = Date.now();
  process.stdout.write(`${JSON.stringify({ runId, phase: "start" })}\n`);
  try {
    const providers = await startRestartProviders(runId, resources);
    const config = restartConfig(runId, {
      mongo: providers.mongoUrl,
      broker: providers.brokerUrl,
    });
    const names = supportCollectionNames(config.namespace);
    const before = await connectRestart(config);
    const persisted = await (async () => {
      try {
        await bootstrapGeneration(before.broker);
        const generation = await readGeneration(before.broker);
        const now = Date.now();
        const proof = await before.dependencies.proof.issue({
          contextId: crypto.randomUUID(),
          now,
          expiresAt: now + 86400000,
        });
        const input = {
          comment: runId,
          errorCode: "TECHNICAL_PROBLEM",
          originalRequestId: crypto.randomUUID(),
          guestContext: proof,
          idempotencyKey: crypto.randomUUID(),
          source: crypto.randomUUID(),
          operationId: crypto.randomUUID(),
        };
        const saved = await submitReport(input, before.dependencies);
        if (saved.isError()) throw new Error(saved.getError());
        const reportId = saved.get().reportId;
        const reports = before.database.apiDb.collection(names.reports);
        await reports.updateOne(
          { reportId },
          { $set: { nextAttemptAt: now + 60000 } },
        );
        const snapshot = await reports.findOne({ reportId });
        expect(snapshot?.emailState).toBe("pending");
        expect(
          await before.database.apiDb.collection(names.outbox).countDocuments(),
        ).toBe(1);
        const mail = createMailObserver({
          url: providers.mailUrl,
          emails: new Set([config.recipient]),
        });
        expect(await mail.read(config.recipient)).toHaveLength(0);
        const worker = await startRestartWorker(runId, providers, resources);
        await waitUntil({
          check: async () => (await before.dependencies.jobs.next()) === null,
        });
        expect((await reports.findOne({ reportId }))?.attempts).toBe(0);
        expect(await mail.read(config.recipient)).toHaveLength(0);
        await ownedContainerAction(runId, worker, "stop");
        return { reportId, input, snapshot, generation, worker, mail };
      } finally {
        await before.close();
      }
    })();
    await ownedContainerAction(runId, providers.mongo, "restart");
    await waitMongo(providers.mongo);
    await ownedContainerAction(runId, providers.broker, "restart");
    const mongoPort = (await docker("port", providers.mongo, "27017/tcp"))
      .split(":")
      .at(-1);
    const brokerPort = (await docker("port", providers.broker, "6379/tcp"))
      .split(":")
      .at(-1);
    const restoredConfig = restartConfig(runId, {
      mongo: `mongodb://127.0.0.1:${mongoPort}/?replicaSet=rs0&directConnection=true`,
      broker: `redis://:isolated-synthetic@127.0.0.1:${brokerPort}`,
    });
    const after = await connectRestart(restoredConfig);
    try {
      await bootstrapGeneration(after.broker);
      const generation = await readGeneration(after.broker);
      expect(generation).not.toBe(persisted.generation);
      expect(await after.dependencies.jobs.next()).toBeNull();
      const reports = after.database.apiDb.collection(names.reports);
      expect(await reports.findOne({ reportId: persisted.reportId })).toEqual(
        persisted.snapshot,
      );
      expect(
        await after.database.apiDb.collection(names.outbox).countDocuments(),
      ).toBe(1);
      const replay = await submitReport(persisted.input, after.dependencies);
      expect(replay.isOk()).toBe(true);
      if (replay.isError()) throw new Error(replay.getError());
      expect(replay.get()).toEqual({
        reportId: persisted.reportId,
        emailState: "pending",
      });
      expect(
        await after.database.apiDb.collection(names.replays).countDocuments(),
      ).toBe(1);
      await reports.updateOne(
        { reportId: persisted.reportId },
        { $set: { nextAttemptAt: Date.now() } },
      );
      await ownedContainerAction(runId, persisted.worker, "restart");
      await waitUntil({
        timeoutMs: 15000,
        check: async () =>
          (await reports.findOne({ reportId: persisted.reportId }))
            ?.emailState === "accepted",
      });
      expect(
        (await reports.findOne({ reportId: persisted.reportId }))?.attempts,
      ).toBe(1);
      expect(await reports.countDocuments()).toBe(1);
      expect(
        await after.database.apiDb.collection(names.outbox).countDocuments(),
      ).toBe(1);
      expect(await persisted.mail.read(config.recipient)).toHaveLength(1);
      process.stdout.write(
        `${JSON.stringify({ runId, mongoRestart: true, brokerRestart: true, workerRestart: true, pendingPreserved: true, streamEmpty: true, replaySameReport: true, canonical: 1, smtpAccepted: 1, elapsedMs: Date.now() - startedAt, workerImage: providers.workerImage })}\n`,
      );
    } finally {
      await after.close();
    }
  } finally {
    await cleanupResources({ testRunId: runId, resources, execute: docker });
    process.stdout.write(
      `${JSON.stringify({ runId, ownedResourcesRemoved: resources.length })}\n`,
    );
  }
}, 120000);
