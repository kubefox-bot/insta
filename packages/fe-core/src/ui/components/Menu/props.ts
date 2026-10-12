import type { Snippet } from "svelte";
export type Props = Readonly<{
  label: string;
  heading?: string;
  children: Snippet;
  items: ReadonlyArray<
    Readonly<{ label: string; disabled?: boolean; onSelect: () => void }>
  >;
}>;
