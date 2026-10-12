import type { HTMLInputAttributes } from "svelte/elements";
export type Props = Readonly<
  Omit<HTMLInputAttributes, "children"> & {
    label: string;
    error?: string;
  }
>;
