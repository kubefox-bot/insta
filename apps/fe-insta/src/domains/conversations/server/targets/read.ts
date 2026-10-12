import { Result } from "@bloodyowl/boxed";
import { z } from "zod";
import {
  startConversation400Schema,
  startConversation401Schema,
} from "../../../../lib/api/generated/schemas/startConversationSchema";
import { startSchema } from "../../contracts/schema";
import type { ReadFailure } from "../ports/reads";

const successSchema = z.object({ ok: z.literal(true), data: startSchema });
const failureSchema = z.union([
  startConversation400Schema,
  startConversation401Schema,
]);
/** Из ответа запуска диалога оставляет ID и участников для продолжения сценария; проверяет обе ветви ответа и сохраняет статус backend-ошибки. */
export const loadStartedConversation = async (
  response: Response,
): Promise<
  Result<
    Pick<z.infer<typeof startSchema>["conversation"], "id" | "participantIds">,
    ReadFailure
  >
> => {
  const raw: unknown = await response.json();
  if (!response.ok)
    return Result.Error({
      code: failureSchema.parse(raw).error.code,
      status: response.status,
    });
  const { conversation } = successSchema.parse(raw).data;
  return Result.Ok({
    id: conversation.id,
    participantIds: conversation.participantIds,
  });
};
