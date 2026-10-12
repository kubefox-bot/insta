import type { Server as HttpServer } from "node:http";
import type { Result } from "@bloodyowl/boxed";
import type { Socket } from "socket.io";
import type { CommandObserver } from "../../../../lib/realtime/index";
import type { Actor, WsTickets } from "../../../users/index";
import type { DeliveryPolicy } from "../../domain/delivery/types";
import type {
  DeliveryJournal,
  DeliveryStreams,
} from "../../ports/delivery/interfaces";
import type { ReadQuota } from "../../ports/quota/types";
import type { Membership } from "../../ports/realtime";
import type { createDeliverySubscriptions } from "../../use-cases/delivery/subscriptions";
export type Recipient = Readonly<{
  actor: Actor;
  socket: Socket;
  deliveries: ReturnType<typeof createDeliverySubscriptions>;
}>;
export type GatewayDependencies = Readonly<{
  server: HttpServer;
  origin: string;
  tickets: Pick<WsTickets, "consume">;
  authorize: (
    input: Readonly<{ actor: Actor; signal: AbortSignal }>,
  ) => Promise<Result<Actor, string>>;
  membership: Membership;
  journal: DeliveryJournal;
  streams: DeliveryStreams;
  policy: DeliveryPolicy;
  quota: ReadQuota;
  observe: CommandObserver;
}>;
