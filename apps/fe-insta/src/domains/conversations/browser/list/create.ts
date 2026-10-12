import { SessionErrorCode } from "@insta/contracts/errors";
import type {
  Conversation,
  ConversationActor,
  ConversationStore,
} from "../types";
import { ownListRequestTimeoutMs } from "./conts";
/** Владеет одним запросом обновления списка с таймаутом; ограничивает его видимостью страницы и actor, а отмену передаёт AbortController. */
export const createListSynchronization = ({
  actor,
  store,
  currentActor,
  visible,
  load,
}: Readonly<{
  actor: ConversationActor;
  store: ConversationStore;
  currentActor: () => ConversationActor | null;
  visible: () => boolean;
  load: (
    signal: AbortSignal,
  ) => Promise<Readonly<{ items: readonly Conversation[] }>>;
}>) => {
  let disposed = false;
  let connectedOnce = false;
  let pending: Promise<void> | null = null;
  let controller: AbortController | null = null;
  /** Проверяет действующего владельца обновления по userId, generation и dispose. */
  const owned = () => {
    const current = currentActor();
    return (
      !disposed &&
      current?.userId === actor.userId &&
      current.generation === actor.generation
    );
  };
  /** Объединяет параллельные обновления в один Promise; очищает таймер после завершения и не принимает результат скрытой или чужой сессии. */
  const refresh = () => {
    if (!owned() || !visible()) return Promise.resolve();
    if (pending) return pending;
    const request = new AbortController();
    controller = request;
    const timeout = setTimeout(() => request.abort(), ownListRequestTimeoutMs);
    const operation = store.synchronizeList(
      { actor, signal: request.signal },
      async () => {
        const result = await load(request.signal);
        if (!owned() || !visible())
          throw new Error(SessionErrorCode.ActorChanged);
        return result.items;
      },
    );
    pending = operation.finally(() => {
      clearTimeout(timeout);
      if (controller === request) {
        controller = null;
        pending = null;
      }
    });
    return pending;
  };
  return {
    refresh,
    /** Пропускает обновление при первом соединении и запрашивает список после последующих подключений. */
    connected: () => {
      const refreshRequired = connectedOnce;
      connectedOnce = true;
      return refreshRequired ? refresh() : Promise.resolve();
    },
    /** Запрашивает отмену текущего чтения при приостановке страницы. */
    suspend: () => controller?.abort(),
    /** Запрещает будущие обновления и запрашивает отмену текущего; это не ожидание завершения Promise. */
    dispose: () => {
      disposed = true;
      controller?.abort();
    },
  };
};
