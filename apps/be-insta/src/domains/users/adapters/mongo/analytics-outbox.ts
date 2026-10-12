import type { Db } from "mongodb";
import { createCanonicalOutbox } from "../../../../lib/observability/analytics/index";
import { authGoalCatalog } from "../../auth/business/catalog";
import { collections } from "./conts";
/**
 * Подключает канонический outbox auth к каталогу аналитических целей; использует
 * переданный Db без владения его соединением.
 */
export const createAuthAnalyticsOutbox = (db: Db) =>
  createCanonicalOutbox({
    db,
    collection: collections.outbox,
    mappings: authGoalCatalog,
  });
