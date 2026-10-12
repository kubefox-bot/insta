import { z } from "zod";
import { collections } from "../../../../apps/be-insta/src/domains/conversations/adapters/mongo/conts";
import { ownedAuthorIds } from "./ownership";
import type { Fixture } from "./types";

export const readStoryConversation = async ({
  request,
  fixture,
}: Readonly<{
  request: Request;
  fixture: Fixture;
}>) => {
  const parsed = z
    .string()
    .regex(/^[a-f0-9]{24}$/)
    .safeParse(new URL(request.url).searchParams.get("conversationId"));
  if (!parsed.success) return new Response(null, { status: 400 });
  const conversations = await fixture.native.db
    .collection(collections.conversations)
    .find({
      participantIds: { $in: await ownedAuthorIds(fixture) },
    })
    .toArray();
  const conversation = conversations.find(
    ({ _id }) => _id.toHexString() === parsed.data,
  );
  if (!conversation) return new Response(null, { status: 403 });
  const messages = await fixture.native.db
    .collection(collections.messages)
    .find({ conversationId: parsed.data }, { projection: { _id: 1 } })
    .toArray();
  return Response.json({
    participantIds: conversation.participantIds,
    messages: messages.map(({ _id }) => _id.toHexString()),
  });
};
