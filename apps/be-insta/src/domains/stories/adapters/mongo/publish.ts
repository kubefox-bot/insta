import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode } from "@insta/contracts/errors";
import type { ConsentReference } from "@insta/fe-core/observability/analytics";
import type { ClientSession, Db } from "mongodb";
import {
  originalProjection,
  readOriginalReference,
} from "../../../../lib/observability/analytics/index";
import { canonicalStory } from "../../business/canonical";
import { storyPolicy } from "../../domain/conts";
import type { StoryPersistence } from "../../ports/persistence/interfaces";
import { storyCollections, storyTransactionOptions } from "./conts";
import { createPublicationReads } from "./publications";
import { publishWithinTransaction } from "./transaction";
import type { AuthorDocument, PublicationRecording } from "./types";
/**
 * Подготавливает строку автора и запускает retryable транзакцию публикации в своей
 * сессии. Неизвестный commit разрешает чтением исхода; сессию закрывает в finally.
 */
export const createStoryPublisher =
  ({
    db,
    startSession,
    analyticsReference,
    recordPublication,
  }: Readonly<{
    db: Db;
    startSession: () => ClientSession;
    recordPublication?: PublicationRecording;
    analyticsReference?: () => ConsentReference | undefined;
  }>): StoryPersistence["publish"] =>
  async (input) => {
    const reference = readOriginalReference(analyticsReference);
    // Ensure the conflicting author row exists before entering a retryable snapshot.
    await db
      .collection<AuthorDocument>(storyCollections.authors)
      .updateOne(
        { _id: input.claim.actorId },
        { $setOnInsert: { revision: 0 } },
        { upsert: true },
      );
    const session = startSession();
    const event = {
      ...canonicalStory(input),
      ...originalProjection(reference),
    };
    try {
      return await session.withTransaction(
        () =>
          publishWithinTransaction({
            db,
            session,
            input,
            event,
            ...(recordPublication ? { recordPublication } : {}),
          }),
        { ...storyTransactionOptions, timeoutMS: storyPolicy.transactionMs },
      );
    } catch {
      const status = await createPublicationReads(db).read(input.claim);
      return status.state === "published"
        ? Result.Ok(status.story)
        : Result.Error(CommonErrorCode.OperationOutcomeUnknown);
    } finally {
      await session.endSession();
    }
  };
