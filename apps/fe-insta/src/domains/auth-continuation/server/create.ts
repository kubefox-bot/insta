import { ContinuationErrorCode } from "@insta/contracts/errors";
import { z } from "zod";
import { intentTypes } from "../domain/conts";
import { createIntent } from "../use-cases/create";
import { ensureContinuationContext } from "./context";
import { intentFailure, intentReply } from "./reply";
import type { ContinuationDependencies, ContinuationRequest } from "./types";

const inputSchema = z.strictObject({
  type: z.enum(intentTypes),
  recipientId: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  operationId: z.uuid(),
});
/**
 * Проверяет JSON создания, обеспечивает защищённый browser-контекст и передаёт actor и дедлайн
 * регистрации сценарию; публикует только квитанцию intent.
 */
export const createRequest = async (
  input: ContinuationRequest,
  dependencies: ContinuationDependencies,
) => {
  const parsed = inputSchema.safeParse(
    await input.request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return intentFailure(ContinuationErrorCode.IntentInvalid);
  const now = Date.now();
  const context = await ensureContinuationContext({
    ...input,
    key: dependencies.key,
    now,
  });
  const result = await createIntent(
    {
      input: parsed.data,
      context,
      actor: dependencies.actor,
      now,
      registrationExpiresAt: dependencies.registrationExpiresAt,
    },
    {
      intents: dependencies.intents,
      /**
       * Выдаёт новый UUID идентификатора intent при создании серверным сценарием.
       */
      uuid: () => crypto.randomUUID(),
    },
  );
  return result.isOk()
    ? intentReply(result.get())
    : intentFailure(result.getError());
};
