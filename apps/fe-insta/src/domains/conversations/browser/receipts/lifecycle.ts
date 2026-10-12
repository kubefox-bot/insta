import { readonly, writable } from "svelte/store";
import type { ConversationStore } from "../types";
import { isReceiptActor } from "./domain/actor";
import { isReadAcknowledged } from "./domain/read-acknowledged";
import { selectedReceiptConversation } from "./domain/selection";
import type { ReceiptQueue, ReceiptQueueDependencies } from "./ports/types";
import { createReceiptQueue } from "./queue";
import type { ReceiptQueueView } from "./types";
/** Привязывает очередь к выбранному диалогу и поколению пользователя; владеет подписками и закрывает их через возвращённый dispose. */
export const mountReceiptAcknowledgments = ({
  store,
  onReadAcknowledged,
  ...dependencies
}: ReceiptQueueDependencies &
  Readonly<{ store: ConversationStore; onReadAcknowledged?: () => void }>) => {
  const view = writable<ReceiptQueueView>({ errors: [] });
  let selectedId: string | null = null;
  let queue: ReceiptQueue | null = null;
  let unsubscribeQueue: (() => void) | null = null;
  let disposed = false;
  /** Отписывает представление, останавливает прежнюю очередь и очищает выбранный диалог и ошибки. */
  const close = () => {
    unsubscribeQueue?.();
    unsubscribeQueue = null;
    queue?.dispose();
    queue = null;
    selectedId = null;
    view.set({ errors: [] });
  };
  /** Создаёт очередь выбранного диалога и подписывает её ошибки; подтверждения применяются только пока эта очередь остаётся текущей. */
  const open = (id: string) => {
    selectedId = id;
    const created = createReceiptQueue({
      ...dependencies,
      /** После ответа проверяет владельца, диалог, отмену и экземпляр очереди перед обновлением store и уведомлением о чтении. */
      acknowledge: async (input) => {
        const snapshot = await dependencies.acknowledge(input);
        const current = dependencies.currentActor();
        if (
          !disposed &&
          !input.signal.aborted &&
          selectedId === id &&
          queue === created &&
          isReceiptActor({ current, expected: dependencies.actor })
        ) {
          store.receiveReceipts(snapshot, dependencies.actor);
          if (isReadAcknowledged({ request: input, snapshot }))
            onReadAcknowledged?.();
        }
        return snapshot;
      },
    });
    queue = created;
    unsubscribeQueue = created.view.subscribe((value) => view.set(value));
  };
  const unsubscribe = store.view.subscribe((state) => {
    if (disposed) return;
    const id = selectedReceiptConversation({
      view: state,
      actor: dependencies.actor,
    });
    if (id !== selectedId) close();
    if (!id) return;
    if (!queue) open(id);
    queue?.acceptMessages(state.histories.get(id)?.items ?? []);
  });
  return {
    view: readonly(view),
    /** Передаёт видимые идентификаторы текущей очереди; при отсутствии выбранного диалога ничего не делает. */
    readVisible: (ids: readonly string[]) => queue?.readVisible(ids),
    /** Просит текущую очередь повторить сохранённый запрос с её ограничениями задержки. */
    retry: () => queue?.retry(),
    /** Отзывает lifecycle, снимает подписку на store и освобождает очередь выбранного диалога. */
    dispose: () => {
      disposed = true;
      unsubscribe();
      close();
    },
  };
};
