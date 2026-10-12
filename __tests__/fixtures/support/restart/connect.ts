import { Result } from "@bloodyowl/boxed";
import {
  createMongoReports,
  createSupportJobs,
  createSupportLimits,
  createSupportProof,
  ensureSupportIndexes,
  supportFingerprint,
} from "../../../../apps/be-insta/src/domains/support-reports/server/index";
import { connectDatabase } from "../../../../apps/be-insta/src/lib/database/index";
import { connectDragonfly } from "../../../../apps/be-insta/src/lib/dragonfly/index";
import type { restartConfig } from "./config";
export const connectRestart = async (
  config: ReturnType<typeof restartConfig>,
) => {
  const database = await connectDatabase({ config: config.mongo });
  try {
    const broker = await connectDragonfly({ config: config.dragonfly });
    try {
      const connection = { ...database, namespace: config.namespace };
      await ensureSupportIndexes(connection);
      return {
        database,
        broker,
        dependencies: {
          reports: createMongoReports(connection),
          jobs: createSupportJobs(broker, `${config.namespace}:mail`),
          proof: createSupportProof(config.signingKey),
          limits: createSupportLimits({
            client: broker,
            key: config.limitsKey,
            namespace: config.namespace,
          }),
          actor: async () => Result.Ok(`${config.runId}:actor`),
          fingerprint: supportFingerprint,
          clock: Date.now,
          uuid: () => crypto.randomUUID(),
        },
        close: async () => {
          broker.close();
          await database.close();
        },
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
