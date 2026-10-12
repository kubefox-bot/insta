import type { Conversation } from "./types";
/**
 * Проверяет участие actor по каноническому списку участников беседы без обращения к
 * хранилищу.
 */
export const isMember = ({
  conversation,
  actorId,
}: Readonly<{ conversation: Conversation; actorId: string }>) =>
  conversation.participantIds.includes(actorId);
/**
 * Строит независимый от порядка ключ пары, сортируя копию и сохраняя исходный tuple
 * участников.
 */
export const pairKey = (participantIds: readonly [string, string]) =>
  [...participantIds].sort().join(":");
