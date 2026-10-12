import { conversationIssues } from "../../conts";
import { historyStates } from "../conts";
import { mergeMessages } from "../merge";
import { synchronize } from "../synchronize";
import type {
  ConversationStore,
  Message,
  SyncDependencies,
  SyncResult,
} from "../types";
import { verifiedContinuity } from "./continuity";
import { historyFailureIssue } from "./history-failure";
import { acquireHistorySubscription } from "./history-subscription";
import { olderQuery } from "./older-query";
import type { ConversationState } from "./state";
import type {
  HistoryOperation,
  SynchronizationInput,
  SynchronizationPhase,
} from "./types";

class HistoryOperations {
  /** Связывает операции истории с переданным владельцем состояния; отдельный глобальный кеш не создаёт. */
  constructor(private readonly state: ConversationState) {}

  /** Сливает или восстанавливает историю, продвигает проверенный курсор и передаёт release подписки состоянию для последующей очистки. */
  readonly #complete = ({
    conversationId,
    result,
    restore,
  }: Readonly<{
    conversationId: string;
    result: SyncResult;
    restore: boolean;
  }>) => {
    const previous = this.state.snapshot().histories.get(conversationId);
    const items = mergeMessages({
      current: restore ? [] : (previous?.items ?? []),
      incoming: result.items,
    });
    this.state.put(conversationId, {
      items,
      verifiedCursor: verifiedContinuity({
        baseline: Math.max(
          previous?.verifiedCursor ?? 0,
          result.verifiedCursor,
        ),
        items,
      }),
      earlierCursor: restore
        ? result.earlierCursor
        : (previous?.earlierCursor ?? result.earlierCursor),
      status: historyStates.ready,
    });
    this.state.retain(conversationId, result.release);
  };
  /** Создаёт live-получателя текущей операции: принимает сообщение и запускает догоняющее чтение при разрыве после завершения текущего чтения. */
  readonly #live =
    ({
      input,
      dependencies,
      operation,
      phase,
    }: Readonly<{
      input: SynchronizationInput;
      dependencies: SyncDependencies;
      operation: HistoryOperation;
      phase: SynchronizationPhase;
    }>) =>
    (message: Message) => {
      if (!operation.active()) return;
      this.state.receive(message, input.actor);
      const current = this.state.snapshot().histories.get(input.conversationId);
      if (
        !phase.reading &&
        current &&
        current.verifiedCursor < message.sequence
      )
        this.synchronize(input, dependencies).catch(() =>
          this.state.report(conversationIssues.historyUnavailable),
        );
    };
  /** Возвращает ещё не опробованный курсор перед разрывом истории; отсутствие разрыва или повторный курсор завершает догоняющее чтение. */
  readonly #followupCursor = ({
    conversationId,
    attempted,
  }: Readonly<{
    conversationId: string;
    attempted: ReadonlySet<number>;
  }>) => {
    const current = this.state.snapshot().histories.get(conversationId);
    if (!current || attempted.has(current.verifiedCursor)) return null;
    return current.items.some(
      ({ sequence }) => sequence > current.verifiedCursor,
    )
      ? current.verifiedCursor
      : null;
  };
  /** Перечитывает сохранённый диапазон для восстановления сообщений и receipt, затем догоняет разрывы без повторения курсора. Устаревший результат сразу освобождает подписку. */
  readonly #catchUp = async ({
    input,
    dependencies,
    operation,
    restore,
  }: Readonly<{
    input: SynchronizationInput;
    dependencies: SyncDependencies;
    operation: HistoryOperation;
    restore: boolean;
  }>) => {
    const phase = { reading: true };
    const attempted = new Set<number>();
    // Reread the retained range so a lost receipt event on an older message recovers.
    const firstSequence = operation.previous?.items[0]?.sequence;
    let cursor =
      restore || firstSequence === undefined ? null : firstSequence - 1;
    let replace = restore;
    try {
      await this.state.settleReleased();
      while (operation.active()) {
        const result = await synchronize(
          { conversationId: input.conversationId, verifiedCursor: cursor },
          {
            ...dependencies,
            /** Передаёт release cache owner сразу после admission, включая ещё читаемый snapshot. */
            subscribe: (id, receive) =>
              acquireHistorySubscription({
                id,
                receive,
                subscribe: dependencies.subscribe,
                active: operation.active,
                retain: this.state.retain,
              }),
            onLive: this.#live({ input, dependencies, operation, phase }),
          },
        );
        if (!operation.active()) {
          await result.release();
          return;
        }
        this.#complete({
          conversationId: input.conversationId,
          result,
          restore: replace,
        });
        await result.release.activate?.();
        const next = this.#followupCursor({
          conversationId: input.conversationId,
          attempted,
        });
        if (next === null) return;
        attempted.add(next);
        cursor = next;
        replace = false;
      }
    } finally {
      phase.reading = false;
    }
  };
  /** Начинает принадлежащую actor синхронизацию; при вытесненном окне восстанавливает историю, а актуальный сбой отражает в состоянии. */
  readonly synchronize: ConversationStore["synchronize"] = async (
    input,
    dependencies,
  ) => {
    const operation = this.state.begin({ ...input, mode: "sync" });
    if (!operation) return { kind: "stale" };
    const previous = operation.previous;
    const restore =
      previous !== undefined &&
      (previous.items.at(-1)?.sequence ?? 0) < previous.verifiedCursor;
    try {
      await this.#catchUp({ input, dependencies, operation, restore });
      return { kind: operation.active() ? "applied" : "stale" };
    } catch (error) {
      if (operation.active()) {
        this.state.fail(input.conversationId, historyFailureIssue(error));
        return { kind: "failed" };
      }
      return { kind: "stale" };
    }
  };
  /** Загружает более раннюю страницу и добавляет только сообщения до прежней первой sequence; поздний результат вытесненной операции игнорирует. */
  readonly earlier: ConversationStore["earlier"] = async (input, history) => {
    const previous = this.state.snapshot().histories.get(input.conversationId);
    if (!previous) return;
    const query = olderQuery({
      conversationId: input.conversationId,
      history: previous,
    });
    if (!query) return;
    const operation = this.state.begin({ ...input, mode: "earlier" });
    if (!operation) return;
    try {
      const page = await history(query);
      if (!operation.active()) return;
      const latest = this.state.snapshot().histories.get(input.conversationId);
      if (!latest) return;
      const first = previous.items[0]?.sequence ?? 0;
      const incoming = page.items.filter(({ sequence }) => sequence < first);
      this.state.put(
        input.conversationId,
        {
          ...latest,
          items: mergeMessages({ current: latest.items, incoming }),
          earlierCursor: query.cursor ? page.pageInfo.nextCursor : null,
          status: historyStates.ready,
        },
        "earlier",
      );
    } catch (error) {
      if (operation.active())
        this.state.fail(input.conversationId, historyFailureIssue(error));
    }
  };
}
/** Публикует привязанные операции синхронизации и ранней истории, сохраняя детали их состояния у владельца. */
export const createHistoryOperations = (state: ConversationState) => {
  const owner = new HistoryOperations(state);
  return { synchronize: owner.synchronize, earlier: owner.earlier };
};
