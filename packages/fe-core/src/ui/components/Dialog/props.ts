import type { Snippet } from "svelte";
export type Props = Readonly<{
  open: boolean;
  title: string;
  description: string;
  closeLabel: string;
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
  children: Snippet;
  headerClose?: Readonly<{ backLabel: string }>;
}>;
