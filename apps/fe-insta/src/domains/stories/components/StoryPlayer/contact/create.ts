import { get, writable } from "svelte/store";
import type { ContactView, Dependencies, Owner } from "./types";
/** Владеет переходом к переписке с автором выбранной Story; поколение выбора защищает от позднего закрытия другого просмотра. */
export const createContactOperation = ({
  selection,
  requestConversation,
  close,
}: Dependencies) => {
  const owner: Owner = { selection: null, generation: 0, disposed: false };
  const state = writable<ContactView>({ pending: false, failed: false });
  /** Инвалидирует прежнюю попытку связи и сбрасывает её индикаторы. */
  const invalidate = () => {
    owner.generation++;
    state.set({ pending: false, failed: false });
  };
  // Subscribe synchronously: close/reopen may occur before the renderer's next effect.
  const unsubscribe = selection.subscribe((current) => {
    if (current.kind === "closed") {
      invalidate();
      owner.selection = null;
      return;
    }
    if (
      owner.selection?.group === current.group &&
      owner.selection.index === current.index
    )
      return;
    invalidate();
    owner.selection = { group: current.group, index: current.index };
  });
  /** Захватывает автора и поколение выбора, запрещая параллельный запрос или запуск после dispose. */
  const begin = () => {
    const current = owner.selection;
    if (!current || owner.disposed || get(state).pending) return null;
    const generation = ++owner.generation;
    /** Проверяет, что завершение запроса всё ещё относится к текущему выбору автора. */
    const isCurrent = () => !owner.disposed && owner.generation === generation;
    state.set({ pending: true, failed: false });
    return { authorId: current.group.author.id, isCurrent };
  };
  /** Открывает переписку с захваченным автором; закрывает просмотр или показывает ошибку только актуальной попытки. */
  const run = async () => {
    const request = begin();
    if (!request) return;
    try {
      await requestConversation({
        authorId: request.authorId,
        isSelected: request.isCurrent,
      });
      if (request.isCurrent()) close();
    } catch {
      if (request.isCurrent()) state.set({ pending: false, failed: true });
    }
  };
  return {
    view: { subscribe: state.subscribe },
    run,
    /** Отписывается от выбора и инвалидирует незавершённую попытку без отмены внешнего запроса. */
    dispose: () => {
      owner.disposed = true;
      unsubscribe();
      invalidate();
      owner.selection = null;
    },
  };
};
