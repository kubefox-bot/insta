import {
  RealtimeErrorCode,
  realtimeEventTypes,
} from "@insta/contracts/realtime";
import {
  applyDelivery,
  type DeliveryReceiver,
  SubscriptionLifecycle,
} from "../../../../lib/realtime/index";
import { storySubscriptionPolicy } from "./conts";
import type { StorySubscriptionDependencies } from "./types";

/** Owns one public projection and its transport generation; no periodic feed reads. */
class StorySubscription {
  readonly #lifecycle: SubscriptionLifecycle;
  #disposed = false;
  #generation = 0;
  #pending: Promise<void> | null = null;
  #retry: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly dependencies: StorySubscriptionDependencies) {
    this.#lifecycle = new SubscriptionLifecycle({
      command: dependencies.command,
      target: { kind: "stories" },
      current: () => !this.#disposed,
      uuid: dependencies.uuid,
    });
  }
  readonly #cancelRetry = () => {
    if (this.#retry !== null) clearTimeout(this.#retry);
    this.#retry = null;
  };
  readonly lost = () => {
    this.#generation++;
    this.#cancelRetry();
    this.#pending = null;
    this.#lifecycle.lost();
  };
  readonly #prepare = async (current: () => boolean) => {
    try {
      await this.#lifecycle.prepare();
    } catch (error) {
      if (!current()) return;
      if (
        !(error instanceof Error) ||
        error.message !== RealtimeErrorCode.ResyncRequired
      )
        throw error;
      await this.#lifecycle.close();
      if (current()) await this.#lifecycle.prepare();
    }
  };
  readonly #bootstrap = async (current: () => boolean) => {
    await this.#prepare(current);
    if (!current()) return;
    const outcome = await this.dependencies.refresh();
    if (!current()) return;
    if (outcome !== "applied") throw new Error("Stories snapshot unavailable");
    await this.#lifecycle.activate();
  };
  /** Retries a failed bootstrap only; successful subscriptions have no timer. */
  readonly ensure = (): Promise<void> => {
    if (this.#disposed || this.#lifecycle.ready()) return Promise.resolve();
    if (this.#pending) return this.#pending;
    this.#cancelRetry();
    const generation = this.#generation;
    const current = () => !this.#disposed && generation === this.#generation;
    const operation = this.#bootstrap(current)
      .catch(() => {
        if (!current()) return;
        this.dependencies.report();
        this.#retry = setTimeout(() => {
          this.#retry = null;
          this.ensure().catch(this.dependencies.report);
        }, storySubscriptionPolicy.retryMs);
      })
      .finally(() => {
        if (this.#pending === operation) this.#pending = null;
      });
    this.#pending = operation;
    return operation;
  };
  readonly #receive: DeliveryReceiver["receive"] = async (unit, active) => {
    if (
      unit.kind !== "single" ||
      unit.event.type !== realtimeEventTypes.storiesChanged ||
      !this.#lifecycle.owns(unit.event.delivery)
    )
      return null;
    const guard = this.#lifecycle.guard();
    const current = () => active() && guard();
    if (!this.#lifecycle.ready())
      return {
        reply: { kind: "retry-later", position: unit.event.delivery },
        current,
      };
    const result = await applyDelivery(
      {
        event: unit.event,
        currentActor: current,
        apply: async () => {
          const outcome = await this.dependencies.refresh();
          return outcome === "applied" ? "applied" : { kind: "retry-later" };
        },
      },
      this.#lifecycle.cursor,
    );
    return result ? { ...result, current } : null;
  };
  readonly #notice: DeliveryReceiver["notice"] = (notice, active) => {
    if (!active() || !this.#lifecycle.owns(notice)) return null;
    const guard = this.#lifecycle.guard();
    const current = () => active() && guard();
    return {
      receipt: notice,
      current,
      afterReply: () => {
        if (current())
          this.#lifecycle
            .close()
            .then(this.ensure)
            .catch(this.dependencies.report);
      },
    };
  };
  readonly delivery: DeliveryReceiver = {
    receive: (unit, active) => this.#receive(unit, active),
    notice: (notice, active) => this.#notice(notice, active),
  };
  readonly dispose = () => {
    this.#disposed = true;
    this.lost();
    this.#lifecycle.cursor.clear();
  };
}
export const createStorySubscription = (
  dependencies: StorySubscriptionDependencies,
) => new StorySubscription(dependencies);
