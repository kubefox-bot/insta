import { createHash } from "node:crypto";
import type { MessageIdentity } from "../../ports/message-identity";
/**
 * Вычисляет digest необязательного idempotency key и fingerprint пары conversation/text
 * для обнаружения несовпадающих повторов.
 */
export const messageIdentity: MessageIdentity = ({
  conversationId,
  text,
  idempotencyKey,
}) => ({
  ...(idempotencyKey === undefined
    ? {}
    : { keyDigest: createHash("sha256").update(idempotencyKey).digest("hex") }),
  fingerprint: createHash("sha256")
    .update(JSON.stringify([conversationId, text]))
    .digest("hex"),
});
