import { queueErrors } from "../../../browser/outbox/domain/conts";
import type { QueueError } from "../../../browser/outbox/domain/types";
import type { Props } from "../props";

/** Выбирает локализованное объяснение ошибки очереди по полному набору QueueError, включая смену actor и недоступность хранения. */
export const queueIssueCopy = ({
  issue,
  copy,
}: Readonly<{ issue: QueueError; copy: Props["copy"] }>): string => {
  const issueCopy = {
    [queueErrors.full]: copy.outbox.full,
    [queueErrors.invalidMessage]: copy.errors.invalidInput,
    [queueErrors.persistenceFailed]: copy.outbox.storageFailed,
    [queueErrors.actorChanged]: copy.auth.actorChanged,
    [queueErrors.authUnavailable]: copy.errors.unavailable,
  } satisfies Record<QueueError, string>;
  return issueCopy[issue];
};
