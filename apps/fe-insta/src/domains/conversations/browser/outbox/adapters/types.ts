import type { messageSchema } from "@insta/contracts/messages";
import type { z } from "zod";
export type ConfirmationObserver = Readonly<{
  onConfirmed?: (
    message: z.infer<typeof messageSchema>,
    actor: Readonly<{ ownerId: string; generation: string }>,
  ) => void;
  onConsumerError?: (error: unknown) => void;
}>;
