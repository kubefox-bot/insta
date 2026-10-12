import { SessionErrorCode } from "@insta/contracts/errors";
import { mergeMessages } from "../merge";
import type {
  ConversationActor,
  ConversationStore,
  Message,
  SyncDependencies,
} from "../types";
/** Связывает операции диалога с фиксированным actor, историей и realtime; навигацию делегирует хосту и защищает от смены пользователя. */
export const createConversationSession = ({
  actor,
  store,
  currentActor,
  history,
  subscribe,
  start,
  openConversation,
}: Readonly<{
  actor: ConversationActor;
  store: ConversationStore;
  currentActor: () => ConversationActor | null;
  history: SyncDependencies["history"];
  subscribe: SyncDependencies["subscribe"];
  start: (
    recipientId: string,
  ) => Promise<Readonly<{ conversation: import("../types").Conversation }>>;
  openConversation: (
    input: Readonly<{ conversationId: string }>,
  ) => Promise<void>;
}>) => ({
  /** Передаёт live-сообщение состоянию с actor этой сессии для проверки владения. */
  receive: (message: Message) => store.receive(message, actor),
  /** Сводит историю и realtime выбранного диалога с проверкой идентичности и receipt. */
  synchronize: (conversationId: string) =>
    store.synchronize(
      { actor, conversationId },
      { subscribe, history, merge: mergeMessages },
    ),
  /** Загружает более раннюю страницу в состояние текущей сессии. */
  earlier: (conversationId: string) =>
    store.earlier({ actor, conversationId }, history),
  /** Проверяет actor до и после запуска диалога; только актуальный результат добавляет в список и открывает. */
  open: async (recipientId: string) => {
    const expected = currentActor();
    if (
      expected?.userId !== actor.userId ||
      expected.generation !== actor.generation
    )
      throw new Error(SessionErrorCode.ActorChanged);
    const result = await start(recipientId);
    const current = currentActor();
    if (
      current?.userId !== actor.userId ||
      current.generation !== actor.generation
    )
      throw new Error(SessionErrorCode.ActorChanged);
    store.addConversation(result.conversation, actor);
    await openConversation({ conversationId: result.conversation.id });
  },
  /** Открывает известный диалог только пока сессия принадлежит исходному actor. */
  openTarget: async ({
    conversationId,
  }: Readonly<{ conversationId: string }>) => {
    const current = currentActor();
    if (
      current?.userId !== actor.userId ||
      current.generation !== actor.generation
    )
      throw new Error(SessionErrorCode.ActorChanged);
    await openConversation({ conversationId });
  },
});
