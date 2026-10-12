import type { Db } from "mongodb";
import { createCanonicalOutbox } from "../../../../lib/observability/analytics/index";
import { storyGoalCatalog } from "../../business/conts";
import { storyCollections } from "./conts";
/**
 * Подключает canonical analytics к Stories outbox и каталогу целей без владения
 * соединением Mongo.
 */
export const createStoryAnalyticsOutbox = (db: Db) =>
  createCanonicalOutbox({
    db,
    collection: storyCollections.outbox,
    mappings: storyGoalCatalog,
  });
