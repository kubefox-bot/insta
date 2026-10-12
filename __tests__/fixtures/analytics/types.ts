import type { Conversations } from "../../../apps/be-insta/src/domains/conversations/index";

export type { OutboxDocument } from "../../../apps/be-insta/src/domains/conversations/adapters/mongo/types";

import type { createBffEnvironment } from "../bff-session/environment";
export type CanonicalFixtureInput = Readonly<{
  request: Request;
  conversations: Conversations;
  db: Awaited<ReturnType<typeof createBffEnvironment>>["native"]["db"];
  actorId: string;
}>;
