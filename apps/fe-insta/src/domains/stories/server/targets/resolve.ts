import type { ReadyTarget, TargetActor, TargetIdentity } from "./types";
/** Разрешает продолжение Stories только при доступной функции и совпадении пользователя и поколения с текущей серверной идентичностью. */
export const resolveStoryTarget = async (
  { type, operationId, actor }: ReadyTarget & Readonly<{ actor: TargetActor }>,
  {
    available,
    readIdentity,
  }: Readonly<{
    available: boolean;
    readIdentity: () => Promise<TargetIdentity>;
  }>,
): Promise<ReadyTarget | undefined> => {
  if (!available) return undefined;
  const identity = await readIdentity();
  if (
    identity.status !== "authenticated" ||
    identity.actor?.userId !== actor.userId ||
    identity.actor.generation !== actor.generation
  )
    return undefined;
  return { type, operationId };
};
