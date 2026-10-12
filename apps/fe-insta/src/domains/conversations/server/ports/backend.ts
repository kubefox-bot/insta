import type { Result } from "@bloodyowl/boxed";
import type {
  messageInputSchema,
  messageSchema,
} from "@insta/contracts/messages";
import type { z } from "zod";
export type SendBackend = (
  input: Readonly<{
    accessToken: string;
    conversationId: string;
    payload: z.infer<typeof messageInputSchema>;
    key?: string;
  }>,
) => Promise<
  Result<
    z.infer<typeof messageSchema>,
    Readonly<{ code: string; status: number; retryAfter?: string }>
  >
>;
