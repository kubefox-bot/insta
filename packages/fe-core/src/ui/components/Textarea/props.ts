import type { HTMLTextareaAttributes } from "svelte/elements";
export type Props = Readonly<
  Omit<HTMLTextareaAttributes, "children"> & {
    label: string;
    error?: string;
  }
>;
