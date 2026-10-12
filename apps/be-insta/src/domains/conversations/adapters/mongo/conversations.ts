import type { ConsentReference } from "@insta/fe-core/observability/analytics";
import type { ClientSession, Db } from "mongodb";
import type { Conversations } from "../../ports/conversations";
import { createReadHistory } from "./history";
import { createUnreadList } from "./list";
import { createStartPair } from "./start";
/**
 * Собирает создание пары, историю и списки на заимствованном Db и фабрике временных
 * transaction sessions.
 */
export const createMongoConversations = (
  input: Readonly<{
    db: Db;
    startSession: () => ClientSession;
    clock: () => number;
    analyticsReference?: () => ConsentReference | undefined;
  }>,
): Conversations => ({
  listUnread: createUnreadList(input),
  startPair: createStartPair(input),
  history: createReadHistory(input),
});
