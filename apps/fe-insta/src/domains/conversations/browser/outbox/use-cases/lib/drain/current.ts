import type { PassDependencies, PassInput } from "./types";
/** Сверяет владельца и поколение прохода с текущим auth перед эффектами очереди. */
export const isCurrent = (
  { ownerId, authGeneration }: PassInput,
  auth: PassDependencies["auth"],
) => {
  const actor = auth.current();
  return actor?.ownerId === ownerId && actor.generation === authGeneration;
};
