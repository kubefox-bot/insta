import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode } from "@insta/contracts/errors";
import { z } from "zod";
import {
  listHistory400Schema,
  listHistory401Schema,
} from "../../../../../lib/api/generated/schemas/listHistorySchema";
import { upstreamUnavailableStatus } from "../../conts";

const failureSchema = z.union([listHistory400Schema, listHistory401Schema]);
/** Проверяет envelope чтения по схеме вызывающего сценария; некорректный ответ становится DependencyUnavailable, распознанная ошибка сохраняет код backend. */
export const decodeReadResponse = <T>({
  response,
  raw,
  schema,
}: Readonly<{ response: Response; raw: unknown; schema: z.ZodType<T> }>) => {
  if (!response.ok) {
    const failure = failureSchema.safeParse(raw);
    return Result.Error({
      code: failure.success
        ? failure.data.error.code
        : CommonErrorCode.DependencyUnavailable,
      status: response.status,
    });
  }
  const parsed = z.object({ ok: z.literal(true), data: schema }).safeParse(raw);
  return parsed.success
    ? Result.Ok(parsed.data.data)
    : Result.Error({
        code: CommonErrorCode.DependencyUnavailable,
        status: upstreamUnavailableStatus,
      });
};
