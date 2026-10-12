import type { Result as Outcome } from "@bloodyowl/boxed";
import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode, DirectoryErrorCode } from "@insta/contracts/errors";
import type { Conversation, ConversationError } from "../../domain/types";
import type { Directory } from "../../ports/directory";

/**
 * Выбирает второго участника пары относительно actor; отсутствие actor в паре возвращает
 * null как нарушение ожидаемой принадлежности.
 */
const recipientIdFor = (conversation: Conversation, actorId: string) => {
  const [firstParticipantId, secondParticipantId] = conversation.participantIds;
  if (firstParticipantId === actorId) return secondParticipantId;
  if (secondParticipantId === actorId) return firstParticipantId;
  return null;
};

/**
 * Пакетно читает уникальных собеседников через public directory; UserNotFound даёт null
 * username, иной отказ — unavailable, исходные беседы не изменяются.
 */
export const enrichRecipients = async <Item extends Conversation>({
  conversations,
  actorId,
  directory,
}: Readonly<{
  conversations: readonly Item[];
  actorId: string;
  directory: Directory;
}>): Promise<
  Outcome<
    ReadonlyArray<Readonly<Item & { recipientUsername: string | null }>>,
    ConversationError
  >
> => {
  const recipients = conversations.map((conversation) => ({
    conversation,
    id: recipientIdFor(conversation, actorId),
  }));
  if (recipients.some(({ id }) => id === null))
    return Result.Error(CommonErrorCode.DependencyUnavailable);
  const validRecipients = recipients.filter(
    (recipient): recipient is { conversation: Item; id: string } =>
      recipient.id !== null,
  );

  const uniqueRecipientIds = [...new Set(validRecipients.map(({ id }) => id))];
  const lookups = await Promise.all(
    uniqueRecipientIds.map(async (id) => ({
      id,
      result: await directory.findPublicUser({ id }),
    })),
  );
  const unavailable = lookups.some(
    ({ result }) =>
      result.isError() && result.getError() !== DirectoryErrorCode.UserNotFound,
  );
  if (unavailable) return Result.Error(CommonErrorCode.DependencyUnavailable);

  const usernames = new Map(
    lookups.flatMap(({ id, result }) =>
      result.isError() ? [] : [[id, result.get().username] as const],
    ),
  );

  return Result.Ok(
    validRecipients.map(({ conversation, id }) => ({
      ...conversation,
      recipientUsername: usernames.get(id) ?? null,
    })),
  );
};
