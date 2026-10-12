import { Result } from "@bloodyowl/boxed";
import { z } from "zod";
import { getMe } from "../../../../api/generated/clients/getMe";
import {
  getMe200Schema,
  getMe401Schema,
} from "../../../../api/generated/schemas/getMeSchema";
import type {
  createApiService,
  createTransport,
  RequestContext,
} from "../../../../api/server/index";
import type { BackendAuth } from "../../ports/backend-auth";
import { mapBackendResult } from "./result";
/** Создаёт чтение backend identity через заимствованные api/client и request context. Ответ /me валидируется generated схемами; наружу успешного результата выходят только userId и username. */
export const createActorReader =
  ({
    api,
    client,
    context,
  }: Readonly<{
    api: ReturnType<typeof createApiService>;
    client: ReturnType<typeof createTransport>;
    context: RequestContext;
  }>): BackendAuth["authorize"] =>
  async (accessToken) => {
    const response = mapBackendResult(
      await api.request({
        context,
        outputSchema: z.union([getMe200Schema, getMe401Schema]),
        /** Передаёт access token в Bearer header generated /me-клиента вместе с request headers. Токен остаётся в серверном REST-вызове, а ответ обрабатывает владелец api.request. */
        execute: ({ headers }) =>
          getMe({
            client,
            headers: { ...headers, authorization: `Bearer ${accessToken}` },
          }),
      }),
    );
    return response.isOk()
      ? Result.Ok({
          userId: response.get().id,
          username: response.get().username,
        })
      : Result.Error(response.getError());
  };
