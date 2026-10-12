import type { StoryRuntimePolicy } from "@insta/contracts/stories";
import { z } from "zod";
import { readStoryPolicy } from "../../../lib/api/generated/clients/readStoryPolicy";
import {
  readStoryPolicy200Schema,
  readStoryPolicy404Schema,
} from "../../../lib/api/generated/schemas/readStoryPolicySchema";
import {
  createApiService,
  createTransport,
  type RequestContext,
} from "../../../lib/api/server/index";
import type { readRuntimeConfig } from "../../../lib/config/server/index";
/** Получает публичную политику Stories через generated REST и проверяет схему; при ошибочном результате возвращает null, не раскрывая серверную конфигурацию. */
export const loadStoryPolicy = async ({
  config,
  context,
}: Readonly<{
  config: ReturnType<typeof readRuntimeConfig>;
  context: RequestContext;
}>) => {
  const result = await createApiService(config.api).request<
    StoryRuntimePolicy,
    z.infer<typeof readStoryPolicy404Schema>["error"]
  >({
    context,
    outputSchema: z.union([readStoryPolicy200Schema, readStoryPolicy404Schema]),
    /** Передаёт заголовки контекста в generated-клиент публичной политики через настроенный серверный транспорт. */
    execute: ({ headers }) =>
      readStoryPolicy({ client: createTransport(config.api), headers }),
  });
  return result.isOk() ? result.get() : null;
};
