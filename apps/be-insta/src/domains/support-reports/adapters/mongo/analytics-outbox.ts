import type { Db } from "mongodb";
import { createCanonicalOutbox } from "../../../../lib/observability/analytics/index";
import { supportGoalCatalog } from "../../business/catalog";
import { supportCollectionNames } from "./collections";
/**
 * Подключает canonical analytics outbox к коллекции support и её каталогу целей, сохраняя
 * владение соединением у composition.
 */
export const createSupportAnalyticsOutbox = ({
  db,
  namespace,
}: Readonly<{ db: Db; namespace?: string }>) =>
  createCanonicalOutbox({
    db,
    collection: supportCollectionNames(namespace).outbox,
    mappings: supportGoalCatalog,
  });
