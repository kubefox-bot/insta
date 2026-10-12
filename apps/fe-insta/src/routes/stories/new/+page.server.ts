import { error } from "@sveltejs/kit";
import { storyForm } from "../../../domains/auth-continuation/server/index";
import { readRuntimeConfig } from "../../../lib/config/server/index";
import { unavailableStoryStatus } from "./conts";
/** Отклоняет страницу при выключенных Stories; иначе сообщает готовность авторизованной сессии и потерю preview по resume_story. Медиа и разрешение камеры здесь не запрашиваются. */
export const load = async ({
  parent,
  url,
}: import("@sveltejs/kit").RequestEvent &
  Readonly<{
    parent: () => Promise<
      Readonly<{
        session: import("../../../domains/users/browser/index").AuthView;
      }>
    >;
  }>) => {
  if (!readRuntimeConfig().storiesAvailable) error(unavailableStoryStatus);
  const data = await parent();
  return {
    ready: data.session.status === "authenticated",
    previewLost: url.searchParams.get("mode") === "resume_story",
  };
};
export const actions = {
  /** Проверяет включённость Stories и передаёт форму, origin и cookies владельцу story continuation. Страница не сохраняет видео и не выполняет публикацию. */
  default: (event: import("@sveltejs/kit").RequestEvent) => {
    if (!readRuntimeConfig().storiesAvailable) error(unavailableStoryStatus);
    return storyForm(
      {
        request: event.request,
        origin: event.url.origin,
        cookies: event.cookies,
      },
      event.locals.continuation,
    );
  },
};
