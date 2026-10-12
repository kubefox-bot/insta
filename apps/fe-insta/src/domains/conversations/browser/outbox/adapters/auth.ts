import { get } from "svelte/store";
import type { AuthBrowser } from "../../../../users/browser/index";
import type { OutboxLifecycleAuth } from "../lib/types";
import { reconcileWhileOnline } from "./lib/auth/reconcile";
import type { AuthAdapterOptions } from "./lib/auth/types";
/** Адаптирует браузерный auth к владельцу очереди, сетевой сверке, уведомлениям поколения и очистке logout. */
export const createOutboxAuth = (
  browser: AuthBrowser,
  {
    online = () => navigator.onLine,
    offlineEvents = window,
  }: AuthAdapterOptions = {},
): OutboxLifecycleAuth => {
  /** Возвращает владельца очереди только из authenticated-представления auth. */
  const current = () => {
    const view = get(browser.view);
    return view.status === "authenticated" && view.actor
      ? { ownerId: view.actor.userId, generation: view.actor.generation }
      : null;
  };
  return {
    current,
    /** Сверяет браузерную сессию с отменой при потере сети и переданным сигналом. */
    reconcile: (options) =>
      reconcileWhileOnline({ browser, online, events: offlineEvents }, options),
    online,
    /** Уведомляет только при изменении поколения auth; возвращённая отписка принадлежит lifecycle очереди. */
    subscribe: (changed) => {
      let previous = current()?.generation;
      return browser.view.subscribe(() => {
        const generation = current()?.generation;
        if (generation === previous) return;
        previous = generation;
        changed();
      });
    },
    /** Регистрирует асинхронную очистку очереди с преобразованием actor auth в владельца outbox. */
    registerLogout: (cleanup) =>
      browser.registerLogout((actor) =>
        cleanup(
          actor
            ? { ownerId: actor.userId, generation: actor.generation }
            : null,
        ),
      ),
  };
};
