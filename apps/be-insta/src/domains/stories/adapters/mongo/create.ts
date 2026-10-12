import type { ConsentReference } from "@insta/fe-core/observability/analytics";
import type { ClientSession, Db } from "mongodb";
import { createStoryCleanup } from "./cleanup";
import { createStoryFeed } from "./feed";
import { ensureStoriesIndexes } from "./indexes";
import { createStoryOutbox } from "./outbox";
import { createStoryOwnership } from "./ownership";
import { createPublicationReads } from "./publications";
import { createStoryPublisher } from "./publish";
import type { PublicationAcknowledgement, PublicationRecording } from "./types";
import { createStoryUploads } from "./uploads";
/**
 * Сначала создаёт индексы, затем собирает узкие порты Stories на общей DB и фабрике
 * сессий; соединение остаётся у composition.
 */
export const createStoriesPersistence = async (
  input: Readonly<{
    db: Db;
    startSession: () => ClientSession;
    recordPublication?: PublicationRecording;
    acknowledgePublication?: PublicationAcknowledgement;
    analyticsReference?: () => ConsentReference | undefined;
  }>,
) => {
  await ensureStoriesIndexes(input.db);
  return {
    cleanup: createStoryCleanup(input.db),
    feed: createStoryFeed(input.db),
    ownership: createStoryOwnership(input.db),
    outbox: createStoryOutbox(input),
    uploads: createStoryUploads(input.db),
    persistence: {
      ...createPublicationReads(input.db),
      publish: createStoryPublisher(input),
    },
  };
};
