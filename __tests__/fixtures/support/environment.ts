import { Result } from "@bloodyowl/boxed";
import { supportCollectionNames } from "../../../apps/be-insta/src/domains/support-reports/adapters/mongo/collections";
import {
  createMongoReports,
  createSupportEmail,
  createSupportJobs,
  createSupportLimits,
  createSupportProof,
  ensureSupportIndexes,
  supportFingerprint,
} from "../../../apps/be-insta/src/domains/support-reports/server/index";
import { connectDatabase } from "../../../apps/be-insta/src/lib/database/index";
import {
  connectDragonfly,
  readGeneration,
} from "../../../apps/be-insta/src/lib/dragonfly/index";
import { readTestApiConfig } from "../environment";
import { createMailObserver } from "../registration/mailpit";
import { disposeSupportFixture } from "./dispose";
export const createSupportEnvironment = async () => {
  const config = readTestApiConfig();
  const runId = `support_test_${crypto.randomUUID().replaceAll("-", "_")}`;
  const database = await connectDatabase({ config: config.mongo });
  try {
    const broker = await connectDragonfly({ config: config.dragonfly });
    try {
      const generation = await readGeneration(broker);
      const connection = { ...database, namespace: runId };
      const collections = supportCollectionNames(runId);
      await ensureSupportIndexes(connection);
      const recipient = `${runId}@insta.test`;
      const mail = createMailObserver({
        url: config.mailpitUrl,
        emails: new Set([recipient]),
      });
      const email = createSupportEmail({ ...config.smtp, recipient });
      let now = Date.now();
      const clock = () => now;
      const dependencies = {
        reports: createMongoReports(connection),
        proof: createSupportProof(config.authSigningKey),
        limits: createSupportLimits({
          client: broker,
          key: config.authLimitsKey,
          namespace: runId,
        }),
        jobs: createSupportJobs(broker, `${runId}:mail`),
        fingerprint: supportFingerprint,
        clock,
        uuid: () => crypto.randomUUID(),
        actor: async () => Result.Ok(`${runId}:user`),
      };
      const context = async () => {
        const id = crypto.randomUUID();
        return dependencies.proof.issue({
          contextId: id,
          now,
          expiresAt: now + 86400000,
        });
      };
      return {
        dependencies,
        db: database.apiDb,
        connection,
        broker,
        generation,
        collections,
        email,
        mail,
        recipient,
        runId,
        context,
        clock,
        advance: (ms: number) => {
          now += ms;
        },
        input: async () => ({
          comment: "<script>canary</script>\r\nBcc: injected@insta.test",
          errorCode: "TECHNICAL_PROBLEM",
          originalRequestId: crypto.randomUUID(),
          guestContext: await context(),
          idempotencyKey: crypto.randomUUID(),
          source: crypto.randomUUID(),
          operationId: crypto.randomUUID(),
        }),
        dispose: () =>
          disposeSupportFixture({
            runId,
            generation,
            collections,
            database,
            broker,
            email,
            mail,
          }),
      };
    } catch (error) {
      broker.close();
      throw error;
    }
  } catch (error) {
    await database.close();
    throw error;
  }
};
