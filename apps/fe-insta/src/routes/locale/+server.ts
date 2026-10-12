import type { RequestEvent } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";
import { localeCookieName, localeSeeOtherStatus } from "../../lib/i18n/index";
import { localeReturnTo } from "../../lib/i18n/return-to";
/** Принимает только ru/en из формы и записывает HttpOnly locale cookie с Secure для HTTPS. Точный Accept application/json получает 204; остальные ответы перенаправляются на проверенный локальный returnTo, невалидная locale получает 400. */
export const POST = async ({
  request,
  cookies,
  url,
}: Pick<RequestEvent, "request" | "cookies" | "url">) => {
  const input = await request.formData();
  const locale = input.get("locale");
  if (locale !== "en" && locale !== "ru")
    return new Response(null, { status: 400 });
  cookies.set(localeCookieName, locale, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
  });
  if (request.headers.get("accept") === "application/json")
    return new Response(null, { status: 204 });
  redirect(
    localeSeeOtherStatus,
    localeReturnTo({ requested: input.get("returnTo"), origin: url.origin }),
  );
};
