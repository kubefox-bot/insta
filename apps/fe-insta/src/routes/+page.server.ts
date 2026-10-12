import { type Actions, redirect, type ServerLoad } from "@sveltejs/kit";
import { continuationForm } from "../domains/auth-continuation/server/index";
import { authFormAction } from "../domains/users/server/index";
import type { load as loadLayout } from "./+layout.server";
import { rootLandingSeeOtherStatus } from "./conts";
/** Перенаправляет авторизованного посетителя в conversations, кроме явно выбранного login/register или continuation intent; эти состояния остаются на главной для подтверждения. */
export const load: ServerLoad<
  Partial<Record<string, string>>,
  Awaited<ReturnType<typeof loadLayout>>
> = async ({ parent, url }) => {
  const data = await parent();
  const mode = url.searchParams.get("mode");
  if (
    data.session.actor &&
    mode !== "login" &&
    mode !== "register" &&
    !data.selectedIntent
  )
    redirect(rootLandingSeeOtherStatus, "/conversations");
  return {};
};
export const actions = {
  /** Читает step из клона формы и передаёт cancel/resume владельцу continuation. Остальные формы идут в auth action с login/registration/session портами и корреляцией; оригинальный request сохраняется для обработчика. */
  default: async (event) => {
    const step = (await event.request.clone().formData()).get("step");
    if (step === "cancel" || step === "resume")
      return continuationForm({
        request: event.request,
        origin: event.url.origin,
        cookies: event.cookies,
        execute: event.locals.continuation,
      });
    return authFormAction(event, {
      login: event.locals.auth.login,
      registration: event.locals.auth.registration,
      session: event.locals.auth.session,
      context: event.locals.correlation,
    });
  },
} satisfies Actions;
