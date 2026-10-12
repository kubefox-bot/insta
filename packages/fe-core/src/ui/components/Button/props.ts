import type { Snippet } from "svelte";
import type {
  HTMLAnchorAttributes,
  HTMLButtonAttributes,
} from "svelte/elements";
export type Props = Readonly<
  {
    variant?: "primary" | "secondary" | "text";
    size?: "sm" | "md" | "lg";
    loading?: boolean;
    children: Snippet;
  } & (
    | (Omit<HTMLButtonAttributes, "children"> & { href?: never })
    | (Omit<HTMLAnchorAttributes, "children" | "type"> & {
        href: string;
        disabled?: boolean;
        type?: never;
        form?: never;
        formaction?: never;
        formenctype?: never;
        formmethod?: never;
        formnovalidate?: never;
        formtarget?: never;
      })
  )
>;
