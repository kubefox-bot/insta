import { get, readonly, writable } from "svelte/store";
import { conversationIssues } from "../../conts";
import { conversationConnectionStates, historyStates } from "../conts";
import { mergeMessages } from "../merge";
import { ReceiptSnapshots } from "../receipts/snapshots";
import type {
  ReceiptBatchWireSnapshot,
  ReceiveReceiptsOutcome,
} from "../receipts/types";
import type {
  CachedHistory,
  Conversation,
  ConversationActor,
  ConversationView,
  History,
  HistorySubscription,
  Message,
} from "../types";
import { cacheHistory } from "./cache";
import { verifiedContinuity } from "./continuity";
export class ConversationState {
  readonly #view;
  readonly #receipts = new ReceiptSnapshots();
  readonly view;
  readonly #operations = {
    sync: new Map<string, number>(),
    earlier: new Map<string, number>(),
  };
  readonly #releases = new Map<string, HistorySubscription>();
  readonly #cleanup = new Set<Promise<void>>();
  #operationId = 0;
  #epoch = 0;
  #listEpoch = 0;
  /** Создаёт приватный store диалогов и readable view; исходный список доступен только при наличии actor, история и выбор начинаются пустыми. */
  constructor({
    initial,
    actor,
  }: Readonly<{
    initial: readonly Conversation[];
    actor: ConversationActor | null;
  }>) {
    this.#view = writable<ConversationView>({
      actor,
      conversations: actor ? initial : [],
      selectedId: null,
      histories: new Map(),
      connection: conversationConnectionStates.connecting,
    });
    this.view = readonly(this.#view);
  }
  /** Читает текущий снимок store без клонирования; вызывающий код должен сохранять его readonly-контракт. */
  readonly snapshot = () => get(this.#view);
  /** Проверяет принадлежность состояния ожидаемому userId и generation. */
  readonly owned = (expected: ConversationActor) => {
    const actor = this.snapshot().actor;
    return (
      actor?.userId === expected.userId &&
      actor.generation === expected.generation
    );
  };
  /** Проецирует накопленные receipt в историю, применяет лимиты кеша и освобождает подписки вытесненных диалогов. */
  readonly put = (
    id: string,
    history: CachedHistory,
    window: "latest" | "earlier" = "latest",
  ) => {
    this.#view.update((state) => {
      const histories = cacheHistory({
        current: state.histories,
        conversationId: id,
        history: {
          ...history,
          items: this.#receipts.project(id, history.items),
        },
        window,
      });
      this.#receipts.retain({ histories });
      return { ...state, histories };
    });
    for (const [cached, release] of this.#releases) {
      if (this.snapshot().histories.has(cached)) continue;
      this.#release(release);
      this.#releases.delete(cached);
    }
    this.#evictOperations();
  };
  /** Удалённая cache projection отменяет также ещё не получивший reservation callback admission. */
  readonly #evictOperations = () => {
    const histories = this.snapshot().histories;
    for (const operations of Object.values(this.#operations)) {
      for (const id of operations.keys())
        if (!histories.has(id)) operations.delete(id);
    }
  };
  /** Инвалидирует операции, очищает receipt, историю и список и освобождает все сохранённые подписки; actor и connection сохраняет. */
  readonly clear = () => {
    this.#epoch++;
    this.#receipts.clear();
    for (const release of this.#releases.values()) this.#release(release);
    this.#releases.clear();
    this.#operations.sync.clear();
    this.#operations.earlier.clear();
    this.#view.update((state) => ({
      ...state,
      conversations: [],
      histories: new Map(),
      selectedId: null,
      issue: undefined,
    }));
  };
  /** При изменении actor удаляет прежние приватные данные и устанавливает нового владельца. */
  readonly reconcileActor = (actor: ConversationActor | null) => {
    if (actor && this.owned(actor)) return;
    this.clear();
    this.#view.update((state) => ({ ...state, actor }));
  };
  /** Публикует выбранный ID диалога без самостоятельной загрузки истории. */
  readonly select = (selectedId: string | null) =>
    this.#view.update((state) => ({ ...state, selectedId }));
  /** Публикует состояние подключения для отображения интерфейсом. */
  readonly setConnection = (
    connection: ConversationView["connection"],
    connectionIssue?: import("@insta/contracts/realtime").RealtimeErrorCode,
  ) =>
    this.#view.update((state) => ({ ...state, connection, connectionIssue }));
  /** Публикует диагностический issue, сохраняя текущие данные диалогов. */
  readonly report = (issue: string) =>
    this.#view.update((state) => ({ ...state, issue }));
  /** Добавляет диалог в начало списка текущего actor, удаляя прежнюю запись того же ID. */
  readonly addConversation = (
    conversation: Conversation,
    actor: ConversationActor,
  ) => {
    if (!this.owned(actor)) return;
    this.#view.update((state) => ({
      ...state,
      conversations: [
        conversation,
        ...state.conversations.filter(({ id }) => id !== conversation.id),
      ],
    }));
  };
  /** Заменяет список текущего actor, инвалидирует прежние чтения списка и снимает issue. */
  readonly applyList = ({
    actor,
    conversations,
  }: Readonly<{
    actor: ConversationActor;
    conversations: readonly Conversation[];
  }>) => {
    if (!this.owned(actor)) return;
    this.#listEpoch++;
    this.#view.update((state) => ({
      ...state,
      conversations,
      issue: undefined,
    }));
  };
  /** Выдаёт проверку актуальности чтения списка по общей эпохе, эпохе списка и actor. */
  readonly beginList = (actor: ConversationActor) => {
    const epoch = this.#epoch;
    const listEpoch = ++this.#listEpoch;
    return () =>
      epoch === this.#epoch &&
      listEpoch === this.#listEpoch &&
      this.owned(actor);
  };
  /** Сливает начальную историю с кешем текущего actor и сохраняет непрерывный курсор без его регрессии. */
  readonly hydrate = ({
    actor,
    conversationId,
    history,
  }: Readonly<{
    actor: ConversationActor;
    conversationId: string;
    history: History;
  }>) => {
    if (!this.owned(actor)) return;
    const previous = this.snapshot().histories.get(conversationId);
    const items = mergeMessages({
      current: previous?.items ?? [],
      incoming: history.items,
    });
    this.put(conversationId, {
      items,
      verifiedCursor: Math.max(
        previous?.verifiedCursor ?? 0,
        verifiedContinuity({
          baseline: history.baselineCursor,
          items: history.items,
        }),
      ),
      earlierCursor: history.pageInfo.nextCursor,
      status: historyStates.ready,
    });
  };
  /** Принимает receipt текущего actor и обновляет загруженную историю; устаревший actor и переполнение возвращает явно, без публикации частичного состояния. */
  readonly receiveReceipts = (
    snapshot: ReceiptBatchWireSnapshot,
    actor: ConversationActor,
  ): ReceiveReceiptsOutcome => {
    if (!this.owned(actor)) return { kind: "stale" };
    const outcome = this.#receipts.receive(snapshot);
    if (outcome.kind === "resync-required") return outcome;
    const history = this.snapshot().histories.get(snapshot.conversationId);
    if (history) this.put(snapshot.conversationId, history);
    return outcome;
  };
  /** Принимает сообщение только в кешированную историю текущего actor, продвигает непрерывность и сортирует диалоги по последней активности. */
  readonly receive = (message: Message, actor: ConversationActor) => {
    if (!this.owned(actor)) return;
    const previous = this.snapshot().histories.get(message.conversationId);
    if (!previous) return;
    const items = mergeMessages({
      current: previous.items,
      incoming: [message],
    });
    this.put(message.conversationId, {
      ...previous,
      items,
      verifiedCursor: verifiedContinuity({
        baseline: previous.verifiedCursor,
        items,
      }),
    });
    this.#view.update((state) => ({
      ...state,
      conversations: state.conversations
        .map((conversation) =>
          conversation.id === message.conversationId
            ? {
                ...conversation,
                lastSequence: Math.max(
                  conversation.lastSequence,
                  message.sequence,
                ),
                lastActivityAt: Math.max(
                  conversation.lastActivityAt,
                  Date.parse(message.createdAt),
                ),
              }
            : conversation,
        )
        .sort((left, right) => right.lastActivityAt - left.lastActivityAt),
    }));
  };
  /** Начинает операцию истории с номером и эпохой. Sync вытесняет раннюю загрузку и освобождает прежнюю подписку; имеющуюся историю переводит в loading. */
  readonly begin = ({
    actor,
    conversationId,
    mode,
  }: Readonly<{
    actor: ConversationActor;
    conversationId: string;
    mode: "sync" | "earlier";
  }>) => {
    if (!this.owned(actor)) return null;
    const epoch = this.#epoch;
    const operations = this.#operations[mode];
    const operation = ++this.#operationId;
    operations.set(conversationId, operation);
    /** Проверяет, что операция истории не вытеснена сменой actor, очисткой или более новым запуском своего режима. */
    const active = () =>
      epoch === this.#epoch &&
      this.owned(actor) &&
      operations.get(conversationId) === operation;
    if (mode === "sync") {
      const earlierOperation =
        (this.#operations.earlier.get(conversationId) ?? 0) + 1;
      this.#operations.earlier.set(conversationId, earlierOperation);
    }
    const previous = this.snapshot().histories.get(conversationId);
    if (previous)
      this.put(conversationId, {
        ...previous,
        status: historyStates.loading,
        issue: undefined,
      });
    if (mode === "sync" && !previous)
      this.put(conversationId, {
        items: [],
        verifiedCursor: 0,
        earlierCursor: null,
        status: historyStates.loading,
      });
    return { active, previous };
  };
  /** Передаёт состоянию владение release диалога, предварительно освобождая прежнюю подписку. */
  readonly retain = (id: string, release: HistorySubscription) => {
    const previous = this.#releases.get(id);
    if (previous === release) return;
    if (previous) this.#release(previous);
    this.#releases.set(id, release);
  };
  /** Учитывает фактическое завершение release; следующий prepare ждёт освобождённого slot. */
  readonly #release = (release: HistorySubscription) => {
    const pending = Promise.resolve(release());
    this.#cleanup.add(pending);
    pending.then(
      () => this.#cleanup.delete(pending),
      () => this.report(conversationIssues.subscriptionUnavailable),
    );
  };
  /** Не выдаёт slot за свободный до успешного unsubscribe ACK. */
  readonly settleReleased = async () => {
    const pending = [...this.#cleanup];
    try {
      await Promise.all(pending);
    } finally {
      for (const operation of pending) this.#cleanup.delete(operation);
    }
  };
  /** Публикует код только затронутой подписки, сохраняя соседние истории. */
  readonly setSubscriptionIssue = (
    id: string,
    code: import("@insta/contracts/realtime").RealtimeErrorCode | undefined,
  ) => {
    this.#view.update((state) => {
      const history = state.histories.get(id);
      if (!history) return state;
      const { deliveryIssue: _issue, ...retained } = history;
      const histories = new Map(state.histories);
      histories.set(id, code ? { ...retained, deliveryIssue: code } : retained);
      return { ...state, histories };
    });
  };
  /** При отказе доступа очищает историю; при временном сбое сохраняет ранее полученные сообщения и курсоры. */
  readonly fail = (
    id: string,
    issue: string = conversationIssues.historyUnavailable,
  ) => {
    const previous = this.snapshot().histories.get(id);
    this.put(id, {
      items: [],
      verifiedCursor: 0,
      earlierCursor: null,
      ...(issue === conversationIssues.historyForbidden ? {} : previous),
      status: historyStates.error,
      issue,
    });
  };
}
