import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode } from "@insta/contracts/errors";
import { storyPolicy } from "../domain/conts";
import { publicationResult } from "../domain/policy";
import type {
  PublishedStory,
  StoryActor,
  StoryError,
  StoryFile,
  UploadClaim,
} from "../domain/types";
import { UploadRejected } from "../domain/upload-rejected";
import type { StoryDependencies } from "../ports/persistence/interfaces";
import { cancelPublication } from "./lib/cancel";
import { claimUpload } from "./lib/claim";
import { ownUploadLease } from "./lib/lease";
import { publishClaim } from "./lib/publish-claim";

/**
 * Создаёт уникальную попытку с lease либо возвращает существующий исход по ключу
 * операции. Ошибки согласует через durable отмену, а heartbeat и связанные ресурсы
 * закрывает в finally.
 */
const publishAttempt = async (
  input: Readonly<{
    actor: StoryActor;
    operationId: string;
    file: StoryFile;
    signal?: AbortSignal;
  }>,
  dependencies: StoryDependencies,
): Promise<Result<PublishedStory, StoryError>> => {
  const now = dependencies.clock();
  const attemptId = dependencies.uuid();
  const claim: UploadClaim = {
    actorId: input.actor.userId,
    operationId: input.operationId,
    attemptId,
    profile: dependencies.activeProfile,
    key: `${dependencies.keyPrefix}${attemptId}`,
    now,
    leaseUntil: now + storyPolicy.leaseMs,
  };
  const result = await claimUpload({ claim, uploads: dependencies.uploads });
  if (result.isError()) return Result.Error(result.getError());
  const acquired = result.get();
  if (acquired.kind === "existing") return publicationResult(acquired.status);
  const lease = ownUploadLease({
    claim,
    uploads: dependencies.uploads,
    clock: dependencies.clock,
    external: input.signal,
  });
  try {
    const result = await publishClaim({
      input,
      claim,
      signal: lease.signal,
      dependencies,
    });
    if (result.isError())
      return await cancelPublication({
        claim,
        dependencies,
        code: result.getError(),
      });
    return result;
  } catch (error) {
    return await cancelPublication({
      claim,
      dependencies,
      code:
        error instanceof UploadRejected
          ? error.code
          : CommonErrorCode.OperationOutcomeUnknown,
    });
  } finally {
    await lease.close();
  }
};

/**
 * После нового commit, replay или восстановления исхода обновляет ленту до ответа.
 * Deferred сохраняет подтверждённую публикацию и durable recovery через outbox;
 * инвалидация выполняется вне upload compensation и не читает файл повторно.
 */
export const publishStory = async (
  input: Parameters<typeof publishAttempt>[0],
  dependencies: StoryDependencies,
): Promise<Result<PublishedStory, StoryError>> => {
  const result = await publishAttempt(input, dependencies);
  if (result.isOk()) {
    await dependencies.refreshFeed({
      actorId: input.actor.userId,
      operationId: input.operationId,
    });
    if (dependencies.publicationDelivery) {
      try {
        await dependencies.publicationDelivery.dispatch(input.signal);
      } catch {
        dependencies.publicationDelivery.deferred();
      }
    }
  }
  return result;
};
