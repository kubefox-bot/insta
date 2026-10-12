export type MessageIdentity = (
  input: Readonly<{
    conversationId: string;
    text: string;
    idempotencyKey?: string;
  }>,
) => Readonly<{ keyDigest?: string; fingerprint: string }>;
