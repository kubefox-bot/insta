import {
  autoSendAgeMs,
  maxAttempts,
  retryDelaysMs,
  retryJitterMs,
  sendTimeoutMs,
} from "./conts";
import type { QueuedMessage, SendOutcome } from "./types";
/** Выбирает отправку, ожидание или явное подтверждение по владельцу, поколению, возрасту, попыткам и доступности сети. */
export const eligibility = ({
  record,
  ownerId,
  authGeneration,
  now,
  online,
}: Readonly<{
  record: QueuedMessage;
  ownerId: string;
  authGeneration: string;
  now: number;
  online: boolean;
}>): "send" | "confirm" | "wait" => {
  if (record.ownerId !== ownerId || record.state === "terminal") return "wait";
  if (
    record.state === "confirmation" ||
    record.lastAuthGeneration !== authGeneration
  )
    return "confirm";
  if (
    !record.manualAttempt &&
    (now - record.createdAt >= autoSendAgeMs || record.attempts >= maxAttempts)
  )
    return "confirm";
  if (!online || record.nextAttemptAt > now) return "wait";
  return "send";
};
/** Создаёт следующую ревизию до отправки, увеличивая попытки и защитный срок; ручную попытку оставляет требующей подтверждения при неизвестном исходе. */
export const beginAttempt = ({
  record,
  authGeneration,
  now,
}: Readonly<{
  record: QueuedMessage;
  authGeneration: string;
  now: number;
}>): QueuedMessage => {
  const next = {
    ...record,
    attempts: record.attempts + 1,
    manualAttempt: false,
    lastAuthGeneration: authGeneration,
    nextAttemptAt: now + sendTimeoutMs,
    revision: record.revision + 1,
  };
  return record.manualAttempt
    ? { ...next, state: "confirmation", needsConfirmation: true }
    : next;
};
/** Вычисляет состояние после неподтверждённой отправки: окончательный отказ, подтверждение пользователя либо повтор с задержкой; исходная запись неизменна. */
export const afterAttempt = ({
  record,
  manualAttempt,
  outcome,
  now,
  jitter,
}: Readonly<{
  record: QueuedMessage;
  manualAttempt: boolean;
  outcome: Exclude<SendOutcome, { kind: "confirmed" }>;
  now: number;
  jitter: number;
}>): QueuedMessage => {
  const base = {
    ...record,
    revision: record.revision + 1,
    manualAttempt: false,
  };
  switch (outcome.kind) {
    case "terminal":
      return {
        ...base,
        state: "terminal",
        needsConfirmation: false,
        errorCode: outcome.code,
      };
    case "auth":
      return { ...base, state: "confirmation", needsConfirmation: true };
    case "retry":
    case "unknown": {
      if (manualAttempt || record.attempts >= maxAttempts)
        return { ...base, state: "confirmation", needsConfirmation: true };
      const retrySchedule = Object.values(retryDelaysMs);
      const normalDelay =
        retrySchedule[Math.max(0, record.attempts - 1)] ??
        retrySchedule[retrySchedule.length - 1];
      const delay =
        outcome.kind === "retry" && outcome.retryAfterMs !== undefined
          ? Math.max(0, outcome.retryAfterMs)
          : normalDelay +
            Math.floor(Math.min(1, Math.max(0, jitter)) * retryJitterMs);
      return {
        ...base,
        state: "queued",
        needsConfirmation: false,
        nextAttemptAt: now + delay,
      };
    }
  }
  return outcome satisfies never;
};
