import { get } from "svelte/store";
import type { AuthBrowser } from "../../../../../../users/browser/index";
/** Сверяет auth только онлайн и вне pending; владеет слушателем offline и локальным контроллером, освобождая оба в finally. */
export const reconcileWhileOnline = async (
  {
    browser,
    online,
    events,
  }: Readonly<{
    browser: AuthBrowser;
    online: () => boolean;
    events: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  }>,
  options?: Readonly<{ signal?: AbortSignal }>,
) => {
  if (!online() || get(browser.view).status === "pending") return;
  const controller = new AbortController();
  /** Запрашивает отмену текущей сверки auth при потере сети. */
  const offline = () => controller.abort();
  events.addEventListener("offline", offline);
  const signal = options?.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  try {
    if (!online()) {
      controller.abort();
      return;
    }
    await browser.reconcile({ signal });
  } finally {
    events.removeEventListener("offline", offline);
    controller.abort();
  }
};
