import { z } from "zod";
import { loadConversationSnapshot } from "../domains/conversations/server/index";
import {
  loadFeedSnapshot,
  loadStoryPolicy,
} from "../domains/stories/server/index";
import {
  projectRegistration,
  registrationCookieName,
} from "../domains/users/server/index";
import { readRuntimeConfig } from "../lib/config/server/index";
import { localeCookieName, resolveLocale } from "../lib/i18n/index";
/** Собирает request-owned SSR snapshot с no-store: независимые session, Stories и registration читаются параллельно, conversations ждёт только actor. Сохраняет locale/privacy и выбранный UUID intent, не раскрывая серверные ключи. */
export const load = async ({
  locals,
  cookies,
  request,
  url,
  setHeaders,
}: import("@sveltejs/kit").RequestEvent) => {
  const config = readRuntimeConfig();
  const storiesAvailable = config.storiesAvailable;
  setHeaders({ "Cache-Control": "no-store" });
  const sessionRead = locals.getSessionView();
  const conversationsRead = sessionRead.then((session) =>
    loadConversationSnapshot({
      actor: session.actor,
      /** Читает conversations через BFF с исходными request/cookies и actor snapshot; BFF повторно проверяет владение сессией. */
      read: () =>
        locals.conversations.list({
          request,
          cookies,
          origin: url.origin,
          owner: session.actor ?? undefined,
        }),
    }),
  );
  const [session, conversations, storiesFeed, storiesPolicy, registration] =
    await Promise.all([
      sessionRead,
      conversationsRead,
      storiesAvailable
        ? loadFeedSnapshot(() =>
            locals.stories.feed(
              new Request(new URL("/api/stories", url), {
                headers: request.headers,
                signal: request.signal,
              }),
            ),
          )
        : null,
      storiesAvailable
        ? loadStoryPolicy({ config, context: locals.correlation ?? {} })
        : null,
      projectRegistration({
        cookie: cookies.get(registrationCookieName),
        key: config.sessionKeys.cookieKey,
        now: Date.now(),
      }),
    ]);
  return {
    ...conversations,
    requestId: locals.correlation?.requestId,
    storiesPolicy,
    storiesAvailable,
    storiesFeed,
    selectedIntent: z.uuid().safeParse(url.searchParams.get("intentId")).success
      ? url.searchParams.get("intentId")
      : null,
    registration,
    session,
    locale: resolveLocale({
      cookie: cookies.get(localeCookieName),
      acceptLanguage: request.headers.get("accept-language"),
    }),
    privacy: locals.privacy,
  };
};
