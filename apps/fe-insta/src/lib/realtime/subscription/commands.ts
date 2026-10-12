import {
  type DeliveryPosition,
  type PreparedSubscription,
  preparedSubscriptionSchema,
  realtimeCommandTypes,
  realtimeKinds,
  realtimeProtocolVersion,
  storiesFeedStream,
} from "@insta/contracts/realtime";
import type { SubscriptionCommand, SubscriptionDependencies } from "./types";
export const samePosition = (
  left: DeliveryPosition,
  right: DeliveryPosition | null,
) =>
  right !== null &&
  left.streamId === right.streamId &&
  left.epoch === right.epoch &&
  left.cursor === right.cursor;
/** Serializes no effects: each operation owns one command and validates its exact target. */
export class SubscriptionCommands {
  constructor(private readonly dependencies: SubscriptionDependencies) {}
  readonly #send = async (command: SubscriptionCommand) => {
    const ack = await this.dependencies.command({
      ...command,
      version: realtimeProtocolVersion,
      kind: realtimeKinds.command,
      meta: { requestId: this.dependencies.uuid() },
    });
    if (!ack.ok) throw new Error(ack.error.code);
    return ack.data;
  };
  readonly #selection = (
    resume: DeliveryPosition | null,
  ): SubscriptionCommand => {
    const target = this.dependencies.target;
    const data = resume ? { resume } : {};
    switch (target.kind) {
      case "conversation":
        return {
          type: realtimeCommandTypes.subscribe,
          data: { conversationId: target.id, ...data },
        };
      case "unread":
        return { type: realtimeCommandTypes.unreadSubscribe, data };
      case "stories":
        return { type: realtimeCommandTypes.storiesSubscribe, data };
    }
    return target satisfies never;
  };
  readonly prepare = async (resume: DeliveryPosition | null) => {
    const data = await this.#send(this.#selection(resume));
    const target = this.dependencies.target;
    const matched =
      target.kind === "conversation"
        ? "conversationId" in data && data.conversationId === target.id
        : "subscription" in data && data.subscription === target.kind;
    if (!matched) throw new Error("Unexpected subscription target");
    const prepared = preparedSubscriptionSchema.parse(
      {
        subscriptionId:
          "subscriptionId" in data ? data.subscriptionId : undefined,
        baseline: "baseline" in data ? data.baseline : undefined,
      },
      { jitless: true },
    );
    if (
      target.kind === "stories" &&
      prepared.baseline.streamId !==
        `${storiesFeedStream.kind}:${storiesFeedStream.id}`
    )
      throw new Error("Unexpected feed stream");
    return prepared;
  };
  readonly activate = async (prepared: PreparedSubscription) => {
    const data = await this.#send({
      type: realtimeCommandTypes.activate,
      data: prepared,
    });
    const confirmed = preparedSubscriptionSchema.parse(data, { jitless: true });
    if (
      confirmed.subscriptionId !== prepared.subscriptionId ||
      !samePosition(confirmed.baseline, prepared.baseline)
    )
      throw new Error("Unexpected activation identity");
  };
  readonly unsubscribe = async () => {
    const target = this.dependencies.target;
    const command: SubscriptionCommand =
      target.kind === "conversation"
        ? {
            type: realtimeCommandTypes.unsubscribe,
            data: { conversationId: target.id },
          }
        : {
            type:
              target.kind === "stories"
                ? realtimeCommandTypes.storiesUnsubscribe
                : realtimeCommandTypes.unreadUnsubscribe,
            data: {},
          };
    const data = await this.#send(command);
    const matched =
      target.kind === "conversation"
        ? "conversationId" in data && data.conversationId === target.id
        : "subscription" in data &&
          data.subscription === target.kind &&
          "subscribed" in data &&
          data.subscribed === false;
    if (!matched) throw new Error("Unexpected unsubscribe target");
  };
}
