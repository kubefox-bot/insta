import type { Readable } from "svelte/store";
import type { inputNames } from "./conts";
export type InputValues = Readonly<
  Partial<Record<(typeof inputNames)[number], string>>
>;
export type AuthInputTransfer = Readonly<{
  view: Readable<InputValues | undefined>;
  capture: (root: HTMLElement) => void;
  clear: () => void;
}>;
