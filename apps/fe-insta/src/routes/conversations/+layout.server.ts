// The request-owned root snapshot also seeds the header before SSR renders children.
/** Передаёт дочернему layout conversations snapshot родителя без повторного backend чтения, сохраняя actor, unread count и ошибку той же SSR-загрузки. */
export const load = async ({
  parent,
}: Readonly<{
  parent: () => Promise<
    Readonly<{
      conversations: readonly import("../../domains/conversations/browser/index").Conversation[];
      conversationsActor:
        | import("../../domains/conversations/browser/index").ConversationActor
        | null;
      conversationsTotalUnreadCount?: number;
      conversationsIssue?: string;
    }>
  >;
}>) => {
  const snapshot = await parent();
  return {
    conversations: snapshot.conversations,
    conversationsActor: snapshot.conversationsActor,
    conversationsTotalUnreadCount: snapshot.conversationsTotalUnreadCount,
    conversationsIssue: snapshot.conversationsIssue,
  };
};
