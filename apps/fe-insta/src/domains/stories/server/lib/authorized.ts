import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode, SessionErrorCode } from "@insta/contracts/errors";
import { z } from "zod";
import { acceptsCookieMutation } from "../../../../lib/http/server/index";
import { webSessionHeaders } from "../../../../lib/session/contracts/index";
import {
  decryptSessionCookie,
  executeForActor,
  sessionCookieName,
} from "../../../../lib/session/server/authorized";
import { storyTransport } from "../conts";
import type { StoryRequest, StoryRequestDependencies } from "../types";

const actorSchema = z.object({
  userId: z.string().min(1),
  generation: z.string().min(1),
});
/** Проверяет origin изменяющего запроса, actor-заголовки и cookie сессии; выполняет запрос от этого actor, разрешая один повтор только для GET. */
export const authorizeStory = async (
  input: StoryRequest,
  dependencies: StoryRequestDependencies,
  execute: (token: string) => ReturnType<StoryRequestDependencies["backend"]>,
) => {
  if (
    input.request.method !== "GET" &&
    !acceptsCookieMutation({ request: input.request, origin: input.origin })
  )
    return Result.Error({
      code: CommonErrorCode.Forbidden,
      status: storyTransport.forbidden,
    });
  const actor = actorSchema.safeParse({
    userId: input.request.headers.get(webSessionHeaders.ownerId),
    generation: input.request.headers.get(webSessionHeaders.generation),
  });
  if (!actor.success)
    return Result.Error({
      code: SessionErrorCode.ActorChanged,
      status: storyTransport.unauthorized,
    });
  const bindingId = await decryptSessionCookie({
    cookie: input.cookies.get(sessionCookieName),
    key: dependencies.cookieKey,
    now: dependencies.session.clock(),
  });
  return executeForActor(
    {
      bindingId,
      actor: actor.data,
      replay: input.request.method === "GET" ? "once" : "never",
      request: execute,
    },
    dependencies.session,
  );
};
