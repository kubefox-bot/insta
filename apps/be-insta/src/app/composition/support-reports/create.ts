import type { RedisClient } from "bun";
import type { SupportDependencies } from "../../../domains/support-reports/index";
import {
  createMongoReports,
  createSupportActor,
  createSupportJobs,
  createSupportLimits,
  createSupportProof,
  ensureSupportIndexes,
  supportFingerprint,
} from "../../../domains/support-reports/server/index";
import type { AuthDependencies } from "../../../domains/users/index";
import type { connectDatabase } from "../../../lib/database/index";
import { readAnalyticsReference } from "../../../lib/observability/analytics/index";
/** Создаёт support индексы и связывает persistence, proof, limits, jobs и auth actor без переноса бизнес-политики в app. */
export const createSupportDependencies = async ({
  database,
  broker,
  auth,
  key,
}: Readonly<{
  database: Awaited<ReturnType<typeof connectDatabase>>;
  broker: RedisClient;
  auth: AuthDependencies;
  key: string;
}>): Promise<SupportDependencies> => {
  await ensureSupportIndexes(database);
  return {
    reports: createMongoReports({
      ...database,
      analyticsReference: readAnalyticsReference,
    }),
    proof: createSupportProof(key),
    limits: createSupportLimits({ client: broker, key }),
    jobs: createSupportJobs(broker),
    fingerprint: supportFingerprint,
    clock: Date.now,
    /** Создаёт независимый идентификатор support-записи на границе композиции. */
    uuid: () => crypto.randomUUID(),
    actor: createSupportActor(auth),
  };
};
