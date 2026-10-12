import type { Result } from "@bloodyowl/boxed";
import { get, type Writable } from "svelte/store";
import { AuthBrowserIssueCode } from "./codes";
import type { Actor, AuthView } from "./types";

/**
 * Владеет применением identity и защитой от устаревших чтений; смена поколения или
 * недоступность вызывают приватную очистку с отражением её ошибки.
 */
export const createIdentityState = ({
  owner,
  view,
  read,
  clear,
}: Readonly<{
  owner: { actor: Actor | null; epoch: number; navigation: AuthView };
  view: Writable<AuthView>;
  read: (signal?: AbortSignal) => Promise<Actor | null>;
  clear: () => Result<undefined, unknown>;
}>) => {
  /**
   * Принимает actor, очищая приватные данные при смене поколения; инвалидирует прежние чтения
   * и сохраняет проблему очистки в view.
   */
  const accept = (actor: Actor | null) => {
    const cleanup =
      actor?.generation !== owner.actor?.generation ? clear() : undefined;
    owner.actor = actor;
    owner.epoch += 1;
    view.set({
      actor,
      status: actor ? "authenticated" : "guest",
      revocation: actor ? undefined : get(view).revocation,
      issue: cleanup?.isError()
        ? AuthBrowserIssueCode.PrivateCleanupFailed
        : get(view).issue,
    });
  };
  /**
   * Очищает приватные данные и убирает actor при недоступной сессии, сохраняя обнаруженную
   * проблему cleanup.
   */
  const unavailable = () => {
    const cleanup = clear();
    owner.actor = null;
    view.set({
      actor: null,
      status: "unavailable",
      issue: cleanup.isError()
        ? AuthBrowserIssueCode.PrivateCleanupFailed
        : get(view).issue,
    });
  };
  /**
   * Перечитывает identity с сигналом отмены и защитой поколения; только актуальный ответ
   * меняет actor либо публикует unavailable.
   */
  const reconcile = async ({
    signal,
  }: Readonly<{ signal?: AbortSignal }> = {}) => {
    if (signal?.aborted) return;
    const epoch = ++owner.epoch;
    /**
     * Проверяет, что чтение identity ещё владеет поколением и не отменено.
     */
    const current = () => epoch === owner.epoch && !signal?.aborted;
    try {
      const actor = await read(signal);
      if (!current()) return;
      accept(actor);
    } catch {
      if (!current()) return;
      unavailable();
    }
  };
  return {
    accept,
    reconcile,
    /**
     * На новом объекте navigation-снимка перечитывает browser identity вместо прямого принятия
     * SSR actor; повтор того же объекта пропускает.
     */
    reconcileNavigation: async (snapshot: AuthView) => {
      if (snapshot === owner.navigation) return;
      owner.navigation = snapshot;
      await reconcile();
    },
  };
};
