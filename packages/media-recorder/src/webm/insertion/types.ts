import type { Element } from "../layout/types";
export type DurationSlot = Readonly<{
  target: Element | undefined;
  floatBytes: number;
  sizeWidth: number;
  paddingBytes: number;
}>;
export type ByteEdit = Readonly<{
  start: number;
  end: number;
  bytes: Uint8Array;
}>;
