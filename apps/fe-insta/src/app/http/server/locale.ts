import type { RequestEvent } from "@sveltejs/kit";
import { localeCookieName, resolveLocale } from "../../../lib/i18n/index";
/**
 * Выбирает locale по cookie и Accept-Language и создаёт SSR-преобразование lang у корневого
 * html; остальные фрагменты документа не локализует.
 */
export const createLocaleHtmlTransform = ({
  request,
  cookies,
}: Pick<RequestEvent, "request" | "cookies">) => {
  const locale = resolveLocale({
    cookie: cookies.get(localeCookieName),
    acceptLanguage: request.headers.get("accept-language"),
  });
  return ({ html }: Readonly<{ html: string }>) =>
    html.replace('<html lang="ru">', `<html lang="${locale}">`);
};
