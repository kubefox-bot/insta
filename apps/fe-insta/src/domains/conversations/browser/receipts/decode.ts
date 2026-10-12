import { z } from "zod";
import { matchesReceiptBatch } from "../../contracts/receipts";
import { receiptReplySchema } from "../../contracts/schema";
import { receiptTransportCodes } from "./conts";
import { ReceiptRequestError } from "./error";

const failureSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.string() }),
});
/** Проверяет HTTP исход, схему, пакет и получателя; при отказе сохраняет статус и Retry-After в типизированной ошибке. */
export const decodeReceiptReply = ({
  response,
  raw,
  conversationId,
  messageIds,
  recipientId,
}: Readonly<{
  response: Response;
  raw: unknown;
  conversationId: string;
  messageIds: readonly string[];
  recipientId: string;
}>) => {
  if (!response.ok) {
    const failure = failureSchema.safeParse(raw);
    throw new ReceiptRequestError(
      failure.success
        ? failure.data.error.code
        : receiptTransportCodes.invalidContract,
      response.status,
      response.headers.get("Retry-After") ?? undefined,
    );
  }
  const parsed = receiptReplySchema.safeParse(raw);
  if (
    !parsed.success ||
    !matchesReceiptBatch({
      snapshot: parsed.data.data,
      conversationId,
      messageIds,
    }) ||
    parsed.data.data.receipts.some(
      (receipt) => receipt.recipientId !== recipientId,
    )
  )
    throw new ReceiptRequestError(
      receiptTransportCodes.invalidContract,
      response.status,
    );
  return parsed.data.data;
};
