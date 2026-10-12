import type { Actions } from "@sveltejs/kit";
import { continuationForm } from "../../domains/auth-continuation/server/index";
export const actions = {
  /** Передаёт серверную форму явного продолжения/отмены в continuation с request, origin, cookies и request-owned executor; выбор и исполнение intent проверяет этот владелец. */
  default: (event) =>
    continuationForm({
      request: event.request,
      origin: event.url.origin,
      cookies: event.cookies,
      execute: event.locals.continuation,
    }),
} satisfies Actions;
