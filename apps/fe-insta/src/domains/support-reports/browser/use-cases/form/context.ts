import type { SupportFormDependencies } from "../../types";
import type { createFormState } from "./lib/state";
/**
 * Получает scope без параллельных запросов и создаёт ключ идемпотентности после ответа.
 * Ошибка даёт unavailable; после неё или newReport возможен новый запрос.
 * Поздний успех после отмены игнорирует.
 */
export const ensureFormContext = async ({
  state,
  transport,
  uuid,
}: SupportFormDependencies &
  Readonly<{ state: ReturnType<typeof createFormState> }>) => {
  const current = state.read();
  if (
    state.signal.aborted ||
    current.scope.kind === "ready" ||
    current.scope.kind === "loading"
  )
    return;
  state.publish({ ...current, scope: { kind: "loading" } });
  try {
    const scopeId = await transport.openSupportForm(state.signal);
    if (state.signal.aborted) return;
    state.publish({
      ...state.read(),
      scope: { kind: "ready", scopeId, idempotencyKey: uuid() },
    });
  } catch {
    state.publish({ ...state.read(), scope: { kind: "unavailable" } });
  }
};
