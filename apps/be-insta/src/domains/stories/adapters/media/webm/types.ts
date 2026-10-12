import type { z } from "zod";
import type { decodedRows } from "./decoded-rows";
export type Element = Readonly<{
  id: number;
  start: number;
  data: number;
  end: number;
  unknown: boolean;
  children: readonly Element[];
}>;
export type WebmPacket = Readonly<{
  track: number;
  timestampNs: number;
  size: number;
  samples: number;
  durationNs: number | null;
  blockStart: number;
}>;
export type WebmTrack = Readonly<{
  number: number;
  codec: "vp8" | "vp9" | "opus";
  width: number;
  height: number;
  channels: number;
  defaultDurationNs: number | null;
  lacing: boolean;
}>;
export type WebmInventory = Readonly<{
  tracks: readonly WebmTrack[];
  packets: readonly WebmPacket[];
  metadataMs: number;
}>;
export type EbmlScope = Readonly<{
  start: number;
  end: number;
  parent: number;
  unknown: boolean;
  depth: number;
}>;
export type EbmlReadContext = Readonly<{
  bytes: Uint8Array;
  budget: { elements: number };
}>;

export type DecodedRow = z.infer<typeof decodedRows>[number];
