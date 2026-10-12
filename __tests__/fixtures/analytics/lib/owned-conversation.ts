import { z } from "zod";
import type { CanonicalFixtureInput } from "../types";
export const findOwnedConversation = async ({
  request,
  conversations,
  actorId,
}: Omit<CanonicalFixtureInput, "db">) => {
  const conversationId = z
    .string()
    .regex(/^[a-f0-9]{24}$/)
    .parse(new URL(request.url).searchParams.get("conversationId"));
  const owned = await conversations.listUnread({ actorId, limit: 100 });
  if (owned.isError()) throw new Error(owned.getError());
  return owned.get().items.some((value) => value.id === conversationId)
    ? conversationId
    : undefined;
};
