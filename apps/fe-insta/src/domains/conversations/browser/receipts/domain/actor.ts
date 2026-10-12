import type { ConversationActor } from "../../types";
/** Проверяет совпадение пользователя и поколения, чтобы поздняя квитанция не попала в новую сессию. */
export const isReceiptActor = ({
  current,
  expected,
}: Readonly<{
  current: ConversationActor | null;
  expected: ConversationActor;
}>) =>
  current?.userId === expected.userId &&
  current.generation === expected.generation;
