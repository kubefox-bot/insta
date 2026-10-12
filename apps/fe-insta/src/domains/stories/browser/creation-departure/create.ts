import { readonly, writable } from "svelte/store";
import type {
  CreationDeparture,
  CreationDepartureDependencies,
  DepartureView,
} from "./types";
/** Владеет локальным решением об уходе и подтверждением потери preview; закрытие сохраняет идентичность публикации с неизвестным исходом. */
export const createCreationDeparture = ({
  recorder,
  hasPreview,
  finish,
}: CreationDepartureDependencies): CreationDeparture => {
  const state = writable<DepartureView>("none");
  let destination = finish;
  let leaving = false;
  /** Последовательно закрывает recorder и выполняет захваченный выход, блокируя повторный уход до завершения. */
  const confirm = async () => {
    if (leaving) return;
    leaving = true;
    const finishSelected = destination;
    try {
      await recorder.close();
      state.set("none");
      await finishSelected();
    } finally {
      leaving = false;
    }
  };
  /** Учитывает как локальный preview, так и ещё не подтверждённую публикацию при решении об уходе. */
  const hasUnpublished = () => {
    return hasPreview() || recorder.hasPendingPublication();
  };
  return {
    view: readonly(state),
    hasUnpublished,
    confirm,
    /** Убирает запрос подтверждения ухода и восстанавливает исходное назначение. */
    cancel: () => {
      state.set("none");
      destination = finish;
    },
    /** Выбирает предупреждение о неизвестной публикации или потере preview; без них сразу выполняет уход. */
    request: async (next = finish) => {
      if (leaving) return;
      destination = next;
      if (recorder.hasPendingPublication()) {
        state.set("uncertain");
        return;
      }
      if (hasPreview()) {
        state.set("discard");
        return;
      }
      await confirm();
    },
  };
};
