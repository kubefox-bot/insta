import type { Socket } from "socket.io";
import { withPublicationSignal } from "../../../../../lib/realtime/index";
import type { Actor } from "../../../../users/index";
import { restoreDeliveryStream } from "../../../use-cases/delivery/restore";
import { createDeliverySubscriptions } from "../../../use-cases/delivery/subscriptions";
import type { GatewayDependencies } from "../types";
import { recoverySliceMs } from "./conts";
import { createDeliveryTarget } from "./send";
import { waitDelivery } from "./wait";
/** Соединяет narrow use cases с socket/clock/timers; каждая подписка владеет recovery и SDK settlement. */
export const createDeliveryLifetime = ({
  actor,
  socket,
  dependencies,
}: Readonly<{
  actor: Actor;
  socket: Socket;
  dependencies: GatewayDependencies;
}>) =>
  createDeliverySubscriptions({
    actor,
    ports: {
      journal: dependencies.journal,
      streams: dependencies.streams,
      policy: dependencies.policy,
      clock: Date.now,
      random: Math.random,
      uuid: () => crypto.randomUUID(),
      authorize: (input) =>
        withPublicationSignal({
          signal: input.signal,
          execute: (signal) =>
            dependencies.authorize({ actor: input.actor, signal }),
        }),
      membership: dependencies.membership,
      target: createDeliveryTarget({
        socket,
        ackTimeoutMs: dependencies.policy.ackTimeoutMs,
      }),
      wait: waitDelivery,
      /** Bounded restore сохраняет partial prefix; actual cancellation/release завершается до нового retry. */
      recover: async ({ after, signal }) => {
        const deadline = new AbortController();
        const timer = setTimeout(
          () => deadline.abort(new Error("Delivery restore slice elapsed")),
          recoverySliceMs,
        );
        try {
          const result = await restoreDeliveryStream(
            { after, signal: AbortSignal.any([signal, deadline.signal]) },
            {
              journal: dependencies.journal,
              streams: dependencies.streams,
              clock: Date.now,
            },
          );
          return "kind" in result ? result.kind : "ready";
        } finally {
          clearTimeout(timer);
        }
      },
    },
  });
