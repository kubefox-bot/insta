import { readonly, writable } from "svelte/store";
import type {
  SearchController,
  SearchDependencies,
  SearchOwner,
  SearchView,
} from "../types";
import { submitSearch } from "./submit";

/**
 * Владеет запросом, поколением и читаемым состоянием поиска; редактирование и dispose отменяют
 * прежний запрос и исключают поздние результаты.
 */
export const createSearchController = ({
  search,
  onResults,
}: SearchDependencies): SearchController => {
  const view = writable<SearchView>({ q: "", status: "idle" });
  const owner: SearchOwner = {
    q: "",
    generation: 0,
    disposed: false,
    pending: undefined,
  };
  /**
   * Инвалидирует поколение и запрашивает отмену текущего поиска, освобождая pending-ссылку без
   * ожидания транспорта.
   */
  const invalidate = () => {
    owner.generation += 1;
    owner.pending?.abort();
    owner.pending = undefined;
  };
  return {
    view: readonly(view),
    /**
     * При изменении строки отменяет старый поиск и возвращает view в idle; после dispose ввод
     * игнорируется.
     */
    edit: (q) => {
      if (owner.disposed || q === owner.q) return;
      invalidate();
      owner.q = q;
      view.set({ q, status: "idle" });
    },
    /**
     * Передаёт текущий запрос владельцу поиска с публикацией результатов через общий view.
     */
    submit: () => submitSearch({ owner, view, search, onResults }),
    /**
     * Закрывает lifetime контроллера, отменяет текущий запрос и очищает видимые результаты.
     */
    dispose: () => {
      owner.disposed = true;
      invalidate();
      view.set({ q: "", status: "idle" });
    },
  };
};
