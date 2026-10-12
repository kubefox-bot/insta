import { createHmac } from "node:crypto";
import { authLimitsKeyContext, authReplayKeyContext } from "./conts";
/** Выводит отдельные ключи replay и лимитов из signing key через различные HMAC-контексты. */
export const deriveAuthKeys = (signingKey: string) => ({
  authReplayKey: createHmac("sha256", Buffer.from(signingKey, "hex"))
    .update(authReplayKeyContext)
    .digest("hex"),
  authLimitsKey: createHmac("sha256", Buffer.from(signingKey, "hex"))
    .update(authLimitsKeyContext)
    .digest("hex"),
});
