import { derived, writable } from "svelte/store";
import { AuthBrowserIssueCode } from "./codes";
import { createAuthExclusive } from "./exclusive";
import { createIdentityState } from "./identity";
import {
  createFinishLogout,
  createLogoutLifecycle,
  createLogoutOperation,
} from "./logout-lifecycle";
import { mountAuth } from "./mount";
import { createPrivateLifecycle } from "./private-lifecycle";
import type {
  Actor,
  AuthBrowser,
  AuthSynchronization,
  AuthView,
} from "./types";
/**
 * Собирает владельца browser identity, приватной очистки и logout; наружу даёт читаемый view и
 * операции, а подписки запускает только mount.
 */
export const createAuthBrowser = ({
  initial,
  read,
  synchronization,
  clearPrivate,
  onExplicitLogout,
}: Readonly<{
  initial: AuthView;
  read: (signal?: AbortSignal) => Promise<Actor | null>;
  synchronization: AuthSynchronization;
  clearPrivate: () => void;
  onExplicitLogout?: () => void;
}>): AuthBrowser => {
  const view = writable(initial);
  const logout = createLogoutLifecycle();
  const {
    clear: clearOwned,
    attemptClear,
    register: registerPrivate,
  } = createPrivateLifecycle({ clearPrivate });
  const owner = {
    actor: initial.actor,
    epoch: 0,
    mounted: false,
    navigation: initial,
  };
  const { accept, reconcile, reconcileNavigation } = createIdentityState({
    owner,
    view,
    read,
    clear: attemptClear,
  });
  return {
    view: derived(view, (state) => state),
    accept,
    registerPrivate,
    registerLogout: logout.register,
    reconcile,
    reconcileNavigation,
    exclusive: createAuthExclusive({ owner, synchronization, reconcile }),
    /**
     * Удаляет прошлую проблему отправки, сохраняя остальное auth-состояние.
     */
    clearSubmissionIssue: () =>
      view.update(({ issue: _issue, ...state }) => state),
    /**
     * Показывает отказ очистки приватных ресурсов без подмены текущего actor.
     */
    reportPrivateCleanupFailure: () =>
      view.update((state) => ({
        ...state,
        issue: AuthBrowserIssueCode.PrivateCleanupFailed,
      })),
    beginLogout: createLogoutOperation({
      owner,
      view,
      clearOwned,
      flush: logout.flush,
      onBegin: synchronization.publishLogout,
    }),
    finishLogout: createFinishLogout({ owner, view }),
    /**
     * Подключает синхронизацию auth и начальное чтение; возвращает очистку подписки и
     * приватных ресурсов.
     */
    mount: () =>
      mountAuth({
        owner,
        subscribe: synchronization.subscribe,
        onExplicitLogout,
        reconcile,
        clearPrivate: clearOwned,
        /**
         * Очищает приватные ресурсы перед публикацией unavailable при отказе фонового
         * reconcile; ошибка очистки не подавляется.
         */
        unavailable: () => {
          clearOwned();
          view.set({ actor: null, status: "unavailable" });
        },
      }),
  };
};
