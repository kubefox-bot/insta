import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode } from "@insta/contracts/errors";
import { z } from "zod";
import { searchUsers } from "../../../../lib/api/generated/clients/searchUsers";
import {
  searchUsers200Schema,
  searchUsers400Schema,
  searchUsers401Schema,
  searchUsers429Schema,
  searchUsers503Schema,
} from "../../../../lib/api/generated/schemas/searchUsersSchema";
import {
  createApiService,
  createTransport,
  type RequestContext,
} from "../../../../lib/api/server/index";
import type { readRuntimeConfig } from "../../../../lib/config/server/index";
import { createSignedHeaders } from "../adapters/lib/signing/headers";
/**
 * Создаёт поиск пользователей с bearer-токеном, корреляцией и подписью источника; сохраняет
 * коды и статусы API, транспортный сбой отображает как 503.
 */
export const createDirectoryBackend = ({
  config,
  context,
  source,
}: Readonly<{
  config: ReturnType<typeof readRuntimeConfig>;
  context: RequestContext;
  source: () => Promise<string>;
}>) => {
  const api = createApiService(config.api);
  const client = createTransport(config.api);
  return async ({
    accessToken,
    q,
  }: Readonly<{ accessToken: string; q: string }>) => {
    const result = await api.request<
      z.infer<typeof searchUsers200Schema>["data"],
      | z.infer<typeof searchUsers400Schema>["error"]
      | z.infer<typeof searchUsers401Schema>["error"]
    >({
      context,
      outputSchema: z.union([
        searchUsers200Schema,
        searchUsers400Schema,
        searchUsers401Schema,
        searchUsers429Schema,
        searchUsers503Schema,
      ]),
      /**
       * Передаёт поисковую строку generated-клиенту вместе с токеном и заголовками источника,
       * полученными от auth-подписанта.
       */
      execute: async ({ headers }) =>
        searchUsers(
          { q },
          {
            client,
            headers: {
              ...headers,
              authorization: `Bearer ${accessToken}`,
              ...(await createSignedHeaders({
                source,
                key: config.bffSourceSigningKey,
                pathname: "/v1/users",
              })),
            },
          },
        ),
    });
    if (result.isOk()) return Result.Ok(result.get());
    const error = result.getError();
    return Result.Error(
      error.kind === "api"
        ? { code: error.error.code, status: error.status }
        : { code: CommonErrorCode.DependencyUnavailable, status: 503 },
    );
  };
};
