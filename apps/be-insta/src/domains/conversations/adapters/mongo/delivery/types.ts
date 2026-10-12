import type { ClientSession, Db } from "mongodb";
import type { z } from "zod";
import type {
  DeliverySource,
  DeliveryStream,
  StoredDelivery,
} from "../../../ports/delivery/types";
import type { deliveryDocumentSchema, deliveryMetadataSchema } from "./schema";
export type DeliveryDocument = z.infer<typeof deliveryDocumentSchema>;
export type DeliveryMetadata = z.infer<typeof deliveryMetadataSchema>;
export type DeliveryRecordingOptions = Readonly<{
  clock: () => number;
  retentionMs: number;
}>;
export type AppendDeliveryInput = Readonly<{
  db: Db;
  session: ClientSession;
  source: DeliverySource;
  targets: readonly Readonly<{
    stream: DeliveryStream;
    eventType: StoredDelivery["eventType"];
  }>[];
  createdAt: number;
  serverNowMs: number;
  retentionMs: number;
}>;
export type RecoveryTarget = z.infer<
  typeof import("./schema").recoveryTargetSchema
>;
export type RetainedSource = {
  _id: string;
  recoveryExpiresAt?: Date;
  recoveryTargets?: RecoveryTarget[];
};
