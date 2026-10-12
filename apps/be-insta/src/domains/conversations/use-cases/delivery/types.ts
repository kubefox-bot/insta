import type {
  DeliveryJournal,
  DeliveryStreams,
} from "../../ports/delivery/interfaces";
export type DeliveryDependencies = Readonly<{
  journal: DeliveryJournal;
  streams: DeliveryStreams;
  clock: () => number;
}>;
export type RestoreInput = Readonly<{
  after: import("@insta/contracts/realtime").DeliveryPosition;
  through?: import("@insta/contracts/realtime").DeliveryPosition;
  signal?: AbortSignal;
}>;
export type OwnedRestoreInput = RestoreInput &
  Readonly<{ lease: import("../../ports/delivery/types").DeliveryLease }>;
export type RestoreResult =
  | import("@insta/contracts/realtime").DeliveryPosition
  | Readonly<{ kind: "resync-required" }>;

export type DeliveryMaintenance = (
  input: Readonly<{ signal: AbortSignal }>,
) => Promise<void>;
export type DeliveryRoundInput = Readonly<{
  outbox: import("../../ports/outbox").MessageOutbox;
  publish: import("../../ports/outbox").MessageSink;
  maintenance: DeliveryMaintenance;
  clock: () => number;
  uuid: () => string;
  signal: AbortSignal;
}>;
export type DeliveryMaintenanceDependencies = Readonly<{
  journal: Pick<DeliveryJournal, "prune">;
  streams: Pick<DeliveryStreams, "retain">;
  clock: () => number;
}>;
export type DeliveryRunInput =
  import("../../ports/delivery/types").DeliverySelection &
    Readonly<{
      prepared: import("@insta/contracts/realtime").PreparedSubscription;
    }>;
export type DeliveryRunState = {
  position: import("@insta/contracts/realtime").DeliveryPosition;
  pending: import("../../domain/delivery/types").DeliveryAttempt | undefined;
  failures: number;
  retries: number;
};
export type SubscriptionEntry = {
  readonly target: import("../../ports/delivery/types").DeliveryStream;
  readonly lifetime: AbortController;
  readonly mode: "snapshot" | "resume";
  state:
    | { kind: "preparing" }
    | {
        kind: "prepared";
        prepared: import("@insta/contracts/realtime").PreparedSubscription;
        active: boolean;
      };
  operation: Promise<void>;
  closing?: Promise<void>;
};
export type SubscriptionPorts =
  import("../../ports/delivery/types").DeliveryRuntimePorts &
    import("../../ports/delivery/types").DeliveryAdmissionPorts;
