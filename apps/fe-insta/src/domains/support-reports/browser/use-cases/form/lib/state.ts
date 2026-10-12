import { get, readonly, writable } from "svelte/store";
import { needsNewScope } from "../../../../domain/submission";
import type { SupportFormView } from "../../../types";
/**
 * Владеет состоянием и AbortController формы, сохраняя предупреждение о возможном предыдущем
 * сохранении между отчётами.
 */
export const createFormState = () => {
  const lifetime = new AbortController();
  const state = writable<SupportFormView>({
    scope: { kind: "empty" },
    attempt: { kind: "idle" },
    uncertain: false,
    canSubmit: false,
  });
  let previousMayBeSaved = false;
  /**
   * Публикует состояние живой формы и вычисляет доступность отправки и неопределённость; после
   * dispose игнорирует поздние результаты.
   */
  const publish = ({
    scope,
    attempt,
  }: Pick<SupportFormView, "scope" | "attempt">) => {
    if (lifetime.signal.aborted) return;
    state.set({
      scope,
      attempt,
      uncertain:
        previousMayBeSaved ||
        ((attempt.kind === "failed" || attempt.kind === "sending") &&
          attempt.uncertain),
      canSubmit:
        scope.kind === "ready" &&
        attempt.kind !== "sending" &&
        attempt.kind !== "saved" &&
        !needsNewScope(attempt),
    });
  };
  return {
    view: readonly(state),
    /**
     * Возвращает текущий снимок scope и попытки для решения о следующем действии.
     */
    read: () => get(state),
    publish,
    signal: lifetime.signal,
    /**
     * Запрашивает отмену транспорта и блокирует дальнейшую публикацию состояния; не ждёт
     * завершения запросов и не отменяет серверное сохранение.
     */
    dispose: () => lifetime.abort(),
    /**
     * Сбрасывает завершённую попытку для нового scope, сохраняя неопределённость; во время
     * отправки, загрузки или после dispose отказывает.
     */
    newReport: () => {
      const current = get(state);
      if (
        lifetime.signal.aborted ||
        current.attempt.kind === "sending" ||
        current.scope.kind === "loading"
      )
        return false;
      previousMayBeSaved = current.uncertain;
      publish({ scope: { kind: "empty" }, attempt: { kind: "idle" } });
      return true;
    },
  };
};
