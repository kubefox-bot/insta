export type PublicationFeedRefresh = "refreshed" | "deferred";
export type PublicationFeedIdentity = Readonly<{
  actorId: string;
  operationId: string;
}>;
