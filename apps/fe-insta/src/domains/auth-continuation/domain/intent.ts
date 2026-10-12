import { intentTypes } from "./conts";
import { resumeTargetSchema } from "./target";
import type { Actor, Intent, ResumeTarget } from "./types";
/**
 * Проверяет принадлежность browser-контексту, срок, отсутствие отмены и ожидаемого
 * пользователя; consumed допускает последующую отдельную проверку replay.
 */
export const availableIntent = ({
  intent,
  context,
  actor,
  now,
}: Readonly<{
  intent?: Intent;
  context: string;
  actor?: Actor;
  now: number;
}>) =>
  !!intent &&
  intent.context === context &&
  intent.expiresAt > now &&
  intent.state !== "cancelled" &&
  (!intent.expectedUserId || intent.expectedUserId === actor?.userId);
/**
 * Проверяет структуру разрешённой цели продолжения без выполнения навигации или
 * бизнес-действия.
 */
export const safeTarget = (target: unknown) =>
  resumeTargetSchema.safeParse(target).success;
/**
 * Разрешает проверку повторного продолжения только тому же userId/generation с сохранённой
 * корректной целью.
 */
export const replayMatches = ({
  intent,
  actor,
}: Readonly<{ intent: Intent; actor: Actor }>) =>
  intent.actorId === actor.userId &&
  intent.actorGeneration === actor.generation &&
  !!intent.target &&
  safeTarget(intent.target);
/**
 * Проверяет принадлежность типа intent поддерживаемому набору сценариев продолжения.
 */
export const supportedResume = (intent: Intent) =>
  intentTypes.includes(intent.type);
/**
 * Возвращает заново разрешённую цель только при совпадении actor, типа и прежнего
 * conversationId/operationId; иначе запрещает replay.
 */
export const replayTarget = ({
  intent,
  actor,
  target,
}: Readonly<{ intent: Intent; actor: Actor; target: ResumeTarget }>) => {
  if (!replayMatches({ intent, actor }) || target.type !== intent.target?.type)
    return undefined;
  const previous = intent.target;
  switch (target.type) {
    case "open_conversation":
    case "compose_message":
      return previous &&
        "conversationId" in previous &&
        previous.conversationId === target.conversationId
        ? target
        : undefined;
    case "create_story":
    case "resume_story":
      return previous &&
        "operationId" in previous &&
        previous.operationId === target.operationId
        ? target
        : undefined;
    default: {
      const exhaustive: never = target;
      return exhaustive;
    }
  }
};
/**
 * Разрешает отмену только живого pending-intent из того же browser-контекста.
 */
export const cancellableIntent = ({
  intent,
  context,
  now,
}: Readonly<{ intent: Intent; context: string; now: number }>) =>
  intent.context === context &&
  intent.expiresAt > now &&
  intent.state === "pending";
