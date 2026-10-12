import { Result } from "@bloodyowl/boxed";
import type { Envelope } from "@insta/contracts/http";
import type { z } from "zod";
import { requestStreamCancellation } from "../../streams/server/index";
import { readResponse } from "./read-response";

import type { ApiConfiguration, ApiFailure } from "./types";
/**
 * Проверяет JSON, размер и соответствие envelope HTTP-статусу через переданную Zod-схему.
 * Различает API, invalid_contract и network outcomes; неподходящий body просит отменить.
 */
export const decodeResponse = async <Data, Error>({
  response,
  outputSchema,
  configuration,
}: {
  readonly response: Response;
  readonly outputSchema: z.ZodType<Envelope<Data, Error>>;
  readonly configuration: ApiConfiguration;
}): Promise<Result<Data, ApiFailure<Error>>> => {
  try {
    if (!response.headers.get("content-type")?.includes("application/json")) {
      if (response.body) requestStreamCancellation(response.body);
      return Result.Error({
        kind: "invalid_contract",
        status: response.status,
      });
    }
    const raw: unknown = JSON.parse(
      await readResponse({ response, ...configuration }),
    );
    const parsed = outputSchema.safeParse(raw);
    if (!parsed.success || parsed.data.ok !== response.ok)
      return Result.Error({
        kind: "invalid_contract",
        status: response.status,
      });
    if (!parsed.data.ok)
      return Result.Error({
        kind: "api",
        status: response.status,
        error: parsed.data.error,
        meta: parsed.data.meta,
      });
    return Result.Ok(parsed.data.data);
  } catch (error) {
    return error instanceof SyntaxError || error instanceof RangeError
      ? Result.Error({ kind: "invalid_contract", status: response.status })
      : Result.Error({ kind: "network" });
  }
};
