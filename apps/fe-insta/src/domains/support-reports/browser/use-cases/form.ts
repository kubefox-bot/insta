import type { SupportForm, SupportFormDependencies } from "../types";
import { ensureFormContext } from "./form/context";
import { createFormState } from "./form/lib/state";
import { submitForm } from "./form/submission";
/**
 * Соединяет состояние формы с получением scope и отправкой; наружу предоставляет читаемый view
 * и dispose владельца lifetime.
 */
export const createSupportForm = ({
  transport,
  uuid,
}: SupportFormDependencies): SupportForm => {
  const state = createFormState();
  /**
   * Получает контекст формы, если он ещё не готов и не загружается.
   */
  const ensureContext = () => ensureFormContext({ state, transport, uuid });
  return {
    view: state.view,
    ensureContext,
    /**
     * Передаёт ввод в сценарий отправки, который фиксирует payload и сохраняет
     * неопределённость повторов.
     */
    submit: (input) => submitForm({ state, transport, input }),
    /**
     * Создаёт контекст нового отчёта только если состояние разрешает сброс текущей попытки.
     */
    newReport: async () => {
      if (state.newReport()) await ensureContext();
    },
    dispose: state.dispose,
  };
};
