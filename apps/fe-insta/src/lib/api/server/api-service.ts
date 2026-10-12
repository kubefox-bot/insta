import { Result } from "@bloodyowl/boxed";
import type { Envelope } from "@insta/contracts/http";
import type { z } from "zod";
import { decodeResponse } from "./decode-response";
import { requestContextHeaders } from "./request-context";
import type { ApiConfiguration, ApiFailure, RequestContext } from "./types";
/**
 * Создаёт границу REST-ответов с заданными лимитами чтения. Не хранит пользовательскую
 * сессию: контекст и вызов generated клиента поступают для каждого запроса.
 */
export const createApiService = (configuration: ApiConfiguration) => ({
  /**
   * Передаёт correlation/consent headers generated-вызову и проверяет envelope ответа.
   * Синхронную ошибку вызова или rejection представляет как network outcome; API-ошибки
   * сохраняет отдельно.
   */
  request: async <Data, Error>({
    execute,
    outputSchema,
    context,
  }: {
    readonly execute: (options: {
      readonly headers: Readonly<Record<string, string>>;
    }) => Promise<Response>;
    readonly outputSchema: z.ZodType<Envelope<Data, Error>>;
    readonly context: RequestContext;
  }): Promise<Result<Data, ApiFailure<Error>>> => {
    const headers = requestContextHeaders(context);
    const response: Result<Response, { readonly kind: "network" }> =
      await Promise.resolve()
        .then(() => execute({ headers }))
        .then(
          (value) => Result.Ok(value),
          () => Result.Error({ kind: "network" } as const),
        );
    if (response.isError()) return Result.Error(response.getError());
    return decodeResponse({
      response: response.get(),
      outputSchema,
      configuration,
    });
  },
});
