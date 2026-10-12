import { get, type Writable } from "svelte/store";
import { logoutCleanupTimeoutMs } from "./conts";
import type { Actor, AuthView } from "./types";
/**
 * Владеет регистрацией асинхронных logout-cleanup обработчиков; flush ожидает их исходы в
 * пределах таймаута, который не останавливает сами обработчики.
 */
export const createLogoutLifecycle = () => {
  const callbacks = new Set<(actor: Actor | null) => Promise<void>>();
  return {
    /**
     * Регистрирует cleanup владельца приватных ресурсов и возвращает снятие регистрации без
     * вызова очистки.
     */
    register: (callback: (actor: Actor | null) => Promise<void>) => {
      callbacks.add(callback);
      return () => callbacks.delete(callback);
    },
    /**
     * Запускает все зарегистрированные cleanup для прежнего actor, объединяет ошибки и
     * ограничивает ожидание; всегда освобождает таймер, но таймаут не доказывает settlement.
     */
    flush: (actor: Actor | null): Promise<void> | undefined => {
      if (!callbacks.size) return undefined;
      const clearing = Promise.allSettled(
        [...callbacks].map(async (callback) => callback(actor)),
      );
      return (async () => {
        const deadline = Promise.withResolvers<never>();
        const timer = setTimeout(
          () => deadline.reject(new Error("Logout cleanup timed out")),
          logoutCleanupTimeoutMs,
        );
        try {
          const outcomes = await Promise.race([clearing, deadline.promise]);
          const failed = outcomes.filter(
            (outcome) => outcome.status === "rejected",
          );
          if (failed.length)
            throw new AggregateError(
              failed.map((outcome) => outcome.reason),
              "Logout cleanup failed",
            );
        } finally {
          clearTimeout(timer);
        }
      })();
    },
  };
};
/**
 * Создаёт начало logout: уведомляет вкладки, убирает actor, запускает асинхронную и синхронную
 * очистку, сохраняя обе ошибки при их совместном отказе.
 */
export const createLogoutOperation =
  ({
    owner,
    view,
    clearOwned,
    flush,
    onBegin,
  }: Readonly<{
    owner: { actor: Actor | null; epoch: number };
    view: import("svelte/store").Writable<import("./types").AuthView>;
    clearOwned: () => void;
    onBegin?: () => void;
    flush: (actor: Actor | null) => Promise<void> | undefined;
  }>) =>
  () => {
    onBegin?.();
    const previous = owner.actor;
    owner.epoch++;
    owner.actor = null;
    view.set({ actor: null, status: "pending" });
    const clearing = flush(previous);
    try {
      clearOwned();
    } catch (cause) {
      if (!clearing) throw cause;
      return clearing.then(
        () => {
          throw cause;
        },
        (failure) => {
          throw new AggregateError([cause, failure], "Logout cleanup failed");
        },
      );
    }
    return clearing;
  };

/**
 * Создаёт завершение logout по квитанции отзыва; публикует guest только если за время запроса
 * не появился новый actor.
 */
export const createFinishLogout =
  ({
    owner,
    view,
  }: Readonly<{ owner: { actor: Actor | null }; view: Writable<AuthView> }>) =>
  (revocation: "pending" | "confirmed") => {
    if (owner.actor) return;
    view.set({
      actor: null,
      status: "guest",
      revocation,
      issue: get(view).issue,
    });
  };
