import type { Snippet } from "svelte";

export type Props = Readonly<{
  brandLabel: string;
  brandHref: string;
  navigation: Snippet;
  localeControls?: Snippet;
  accountActions: Snippet;
}>;
