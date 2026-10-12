import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode } from "@insta/contracts/errors";
import { z } from "zod";
import {
  sendMessage200Schema,
  sendMessage400Schema,
  sendMessage401Schema,
} from "../../../../../lib/api/generated/schemas/sendMessageSchema";
import { upstreamUnavailableStatus } from "../../conts";
import type { SendBackend } from "../../ports/backend";

const failureSchema = z.union([sendMessage400Schema, sendMessage401Schema]);
/** Проверяет успешный ответ отправки и схему ошибки; недостоверный payload трактует как неизвестный исход. Для HTTP-ошибки сохраняет статус и Retry-After. */
export const decodeBackendSend = ({
  response,
  raw,
}: Readonly<{ response: Response; raw: unknown }>): Awaited<
  ReturnType<SendBackend>
> => {
  if (response.ok) {
    const parsed = sendMessage200Schema.safeParse(raw);
    return parsed.success
      ? Result.Ok(parsed.data.data)
      : Result.Error({
          code: CommonErrorCode.OperationOutcomeUnknown,
          status: upstreamUnavailableStatus,
        });
  }
  const parsed = failureSchema.safeParse(raw);
  return Result.Error({
    code: parsed.success
      ? parsed.data.error.code
      : CommonErrorCode.OperationOutcomeUnknown,
    status: response.status,
    retryAfter: response.headers.get("Retry-After") ?? undefined,
  });
};
