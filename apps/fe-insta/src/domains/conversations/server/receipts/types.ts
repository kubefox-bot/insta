import type { Result } from "@bloodyowl/boxed";
import type {
  receiptBatchSchema,
  receiptBatchSnapshotSchema,
} from "@insta/contracts/messages";
import type { z } from "zod";
import type { SendDependencies, SendRequest } from "../types";
export type ReceiptBackend = (
  input: Readonly<{
    accessToken: string;
    conversationId: string;
    payload: z.infer<typeof receiptBatchSchema>;
  }>,
) => Promise<
  Result<
    z.infer<typeof receiptBatchSnapshotSchema>,
    Readonly<{ code: string; status: number; retryAfter?: string }>
  >
>;
export type AcknowledgeReceiptRequest = SendRequest;
export type AcknowledgeReceiptDependencies = Omit<SendDependencies, "backend"> &
  Readonly<{ backend: ReceiptBackend }>;
