import { get } from "svelte/store";
import {
  createResume,
  type ResumeDependencies,
  resolveContinuation,
} from "../../../domains/auth-continuation/browser/index";
import type { AuthBrowser } from "../../../domains/users/browser/index";

/**
 * Соединяет continuation resolver с операциями открытия целей и auth view; локальный lifetime
 * запрещает завершение resume после dispose.
 */
export const createRuntimeResume = ({
  authView,
  openConversation,
  openStory,
  onResumed,
  onRejected,
}: Readonly<{
  authView: AuthBrowser["view"];
  openStory: ResumeDependencies["openStory"];
  openConversation: ResumeDependencies["openConversation"];
  onResumed?: ResumeDependencies["onResumed"];
  onRejected?: ResumeDependencies["onRejected"];
}>) => {
  const lifetime = { disposed: false };
  return {
    resume: createResume({
      resolveResume: resolveContinuation,
      /**
       * Выдаёт актуальное поколение actor только пока runtime жив; после dispose не позволяет
       * подтвердить продолжение.
       */
      currentGeneration: () =>
        lifetime.disposed ? undefined : get(authView).actor?.generation,
      openConversation,
      openStory,
      onResumed,
      onRejected,
    }),
    /**
     * Инвалидирует дальнейшее завершение continuation этого runtime, не меняя общую auth view.
     */
    dispose: () => {
      lifetime.disposed = true;
    },
  };
};
/**
 * Явно отклоняет Story continuation в runtime диалогов: открытие Story требует её owning
 * route.
 */
export const rejectStoryResume = async () => {
  throw new Error("Story continuation requires its owning route");
};
