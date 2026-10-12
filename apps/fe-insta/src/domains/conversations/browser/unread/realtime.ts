import { RealtimeErrorCode } from "@insta/contracts/realtime";
import { get } from "svelte/store";
import {
  type ApplyOutcome,
  applyUnreadBatch,
  type DeliveryReceiver,
  type Event,
  SubscriptionLifecycle,
} from "../../../../lib/realtime/index";
import type { RecoveryPhase } from "../adapters/subscription/types";
import type { ConversationActor } from "../types";
import type { UnreadSubscriptionDependencies } from "./types";

/** Владеет account unread subscription и canonical recovery без отдельного REST retry timer. */
class SubscriptionOwner {
  readonly #lifecycle: SubscriptionLifecycle;
  #actor: ConversationActor | null = null;
  #generation = 0;
  #disposed = false;
  #pending: Promise<void> | null = null;
  #recovery: Promise<void> | null = null;
  #recoveryPhase: RecoveryPhase = "idle";
  #claimGeneration = 0;
  #issue: RealtimeErrorCode | undefined;
  #controller = new AbortController();
  constructor(private readonly dependencies: UnreadSubscriptionDependencies) {
    this.#lifecycle = new SubscriptionLifecycle({
      command: dependencies.command,
      target: { kind: "unread" },
      current: this.#owned,
      uuid: dependencies.uuid,
    });
  }
  /** Проверяет actor lifetime, не transport token. */
  readonly #owned = () => {
    const actor = get(this.dependencies.unread.view).actor;
    return (
      !this.#disposed &&
      this.#actor !== null &&
      actor?.userId === this.#actor.userId &&
      actor.generation === this.#actor.generation
    );
  };
  /** Инвалидирует socket attempt и отменяет только принадлежащее ему чтение. */
  readonly lost = () => {
    this.#generation++;
    if (this.#recoveryPhase === "reserved" || this.#recoveryPhase === "running")
      this.#recoveryPhase = "interrupted";
    this.#controller.abort();
    this.#controller = new AbortController();
    this.#pending = null;
    this.#lifecycle.lost();
  };
  /** Устаревшая prepare попытка не продолжает bootstrap; resync сначала закрывает target. */
  readonly #prepare = async (active: () => boolean) => {
    try {
      await this.#lifecycle.prepare();
    } catch (error) {
      if (!active()) return;
      if (
        !(error instanceof Error) ||
        error.message !== RealtimeErrorCode.ResyncRequired
      )
        throw error;
      await this.#lifecycle.close();
      if (!active()) return;
      await this.#lifecycle.prepare();
    }
  };
  /** Canonical snapshot располагается строго между prepare H и exact activate. */
  readonly #bootstrap = async () => {
    const generation = this.#generation;
    const claim = this.#claimGeneration;
    const active = () => this.#owned() && generation === this.#generation;
    await this.#prepare(active);
    if (!active()) return;
    const result = await this.dependencies.unread.refreshForDelivery({
      signal: this.#controller.signal,
    });
    if (!active() || result.kind === "stale") return;
    if (result.kind === "unauthorized") {
      this.dependencies.onUnauthorized?.();
      this.dispose();
      return;
    }
    if (result.kind !== "applied")
      throw new Error("Unread canonical snapshot unavailable");
    await this.#lifecycle.activate();
    if (active() && claim === this.#claimGeneration) {
      this.#issue = undefined;
      this.#recoveryPhase = "idle";
      this.dependencies.unread.reportDeliveryIssue(undefined);
    }
  };
  /** Coalesces admission; failed snapshot не становится успешной подпиской. */
  readonly ensure = () => {
    if (
      this.#disposed ||
      (this.#issue && this.#recoveryPhase !== "interrupted") ||
      this.#lifecycle.ready()
    )
      return Promise.resolve();
    if (this.#pending) return this.#pending;
    this.#actor = get(this.dependencies.unread.view).actor;
    if (!this.#actor) return Promise.resolve();
    const generation = this.#generation;
    const operation = this.#bootstrap()
      .catch((error) => {
        if (generation === this.#generation && this.#owned()) {
          if (this.#recoveryPhase === "interrupted")
            this.#recoveryPhase = "failed";
          this.dependencies.unread.reportUnavailable();
          throw error;
        }
      })
      .finally(() => {
        if (this.#pending === operation) this.#pending = null;
      });
    this.#pending = operation;
    return operation;
  };
  readonly connected = this.ensure;
  /** Резервирует resync до receipt; запускает I/O только из transport afterReply. */
  readonly #claimResync = () => {
    if (this.#recoveryPhase !== "idle") return undefined;
    this.#recoveryPhase = "reserved";
    const claim = ++this.#claimGeneration;
    this.#issue = RealtimeErrorCode.ResyncRequired;
    this.dependencies.unread.reportDeliveryIssue(this.#issue);
    const generation = this.#generation;
    const active = () =>
      this.#owned() &&
      generation === this.#generation &&
      claim === this.#claimGeneration;
    return () => {
      if (!active() || this.#recovery) return;
      this.#recoveryPhase = "running";
      const operation = (async () => {
        await this.#lifecycle.close();
        if (active()) await this.#bootstrap();
      })()
        .catch(() => {
          if (active()) {
            this.#recoveryPhase = "failed";
            this.dependencies.unread.reportDeliveryIssue(
              RealtimeErrorCode.ResyncRequired,
            );
          }
        })
        .finally(() => {
          if (this.#recovery === operation) this.#recovery = null;
        });
      this.#recovery = operation;
    };
  };
  /** Typed outcomes unread owner отображаются в существующие wire outcomes без потери cursor. */
  readonly #refresh = async (): Promise<ApplyOutcome> => {
    const result = await this.dependencies.unread.refreshForDelivery({
      signal: this.#controller.signal,
    });
    switch (result.kind) {
      case "applied":
        return "applied";
      case "stale":
        return "stale";
      case "retry-later":
        return result;
      case "apply-failed":
        return { kind: "apply-failed" };
      case "unauthorized":
        this.dependencies.onUnauthorized?.();
        this.dispose();
        return "stale";
    }
    return result satisfies never;
  };
  /** Обрабатывает сразу весь ordered unread suffix одним canonical read. */
  readonly #receive: DeliveryReceiver["receive"] = async (unit, active) => {
    const events = unit.kind === "unread-batch" ? unit.events : [unit.event];
    const first = events[0];
    const last = events.at(-1);
    if (
      !first ||
      !last ||
      events.some((event) => event.type !== "conversations.unread.changed") ||
      !this.#lifecycle.owns(first.delivery)
    )
      return null;
    const guard = this.#lifecycle.guard();
    const current = () => active() && guard();
    if (!this.#lifecycle.ready() || this.#issue)
      return {
        reply: { kind: "retry-later", position: last.delivery },
        current,
      };
    const result = await applyUnreadBatch(
      { events, currentActor: current, apply: this.#refresh },
      this.#lifecycle.cursor,
    );
    return result ? { ...result, current } : null;
  };
  /** Устанавливает только текущую control notice; duplicate re-receipt не запускает bootstrap. */
  readonly #notice: DeliveryReceiver["notice"] = (notice, active) => {
    if (!active() || !this.#lifecycle.owns(notice)) return null;
    const guard = this.#lifecycle.guard();
    const current = () => active() && guard();
    const afterReply =
      notice.code === RealtimeErrorCode.ResyncRequired
        ? this.#claimResync()
        : undefined;
    if (notice.code === RealtimeErrorCode.DeliveryBlocked) {
      this.#claimGeneration++;
      this.#recoveryPhase = "failed";
      this.#issue = notice.code;
      this.dependencies.unread.reportDeliveryIssue(notice.code);
    }
    return { receipt: notice, current, ...(afterReply ? { afterReply } : {}) };
  };
  readonly delivery: DeliveryReceiver = {
    receive: (unit, active) => this.#receive(unit, active),
    notice: (notice, active) => this.#notice(notice, active),
  };
  /** Сохраняет явный single-event API для callers, используя ту же delivery очередь. */
  readonly receive = (
    event: Extract<Event, { type: "conversations.unread.changed" }>,
  ) => this.#receive({ kind: "single", event }, () => true);
  /** Явное действие пользователя запускает ровно один recovery, сохраняя ошибку при отказе snapshot. */
  readonly retry = () => {
    if (this.#disposed || this.#recovery) return;
    this.#recoveryPhase = "idle";
    this.#claimResync()?.();
  };
  /** Отменяет owned reads и удаляет retained delivery cursor при смене account. */
  readonly dispose = () => {
    this.#disposed = true;
    this.lost();
    this.#lifecycle.cursor.clear();
  };
}
/** Создаёт изолированный owner account unread; socket остаётся у account host. */
export const createUnreadSubscription = (
  dependencies: UnreadSubscriptionDependencies,
) => new SubscriptionOwner(dependencies);
