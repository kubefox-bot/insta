import type { z } from "zod";
import { listUnreadConversations } from "../../../../lib/api/generated/clients/listUnreadConversations";
import type { createTransport } from "../../../../lib/api/server/index";
import { unreadListSchema } from "../../contracts/schema";
import type { createReadRequest } from "./lib/read";

/** Создаёт чтение unread-списка через текущий backend-контракт без повтора через устаревшую операцию. */
export const createUnreadListRead =
  ({
    client,
    request,
  }: Readonly<{
    client: ReturnType<typeof createTransport>;
    request: ReturnType<typeof createReadRequest>;
  }>) =>
  (accessToken: string) =>
    request<z.infer<typeof unreadListSchema>>({
      accessToken,
      method: "GET",
      pathname: "/v1/conversations/unread",
      schema: unreadListSchema,
      /** Вызывает generated unread endpoint с уже подготовленными заголовками. */
      execute: (headers) =>
        listUnreadConversations(undefined, { client, headers }),
    });
