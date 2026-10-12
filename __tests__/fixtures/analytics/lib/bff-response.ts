export const bffFixtureData = (path: string) => {
  if (path === "/v1/conversations")
    return {
      conversation: {
        id: "a".repeat(24),
        participantIds: ["actor", "recipient"],
        lastSequence: 0,
        lastActivityAt: 1,
      },
      code: "CONVERSATION_CREATED",
    };
  if (path.endsWith("/messages"))
    return {
      id: "message",
      conversationId: "a".repeat(24),
      authorId: "actor",
      text: "synthetic",
      sequence: 1,
      createdAt: new Date().toISOString(),
    };
  if (path === "/v1/support/form-context")
    return { proof: "owned-support-proof", expiresAt: Date.now() + 60000 };
  if (path === "/v1/support/reports")
    return { reportId: crypto.randomUUID(), emailState: "pending" };
  return true;
};
