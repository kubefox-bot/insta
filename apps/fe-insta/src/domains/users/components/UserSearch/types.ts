import type { Readable } from "svelte/store";
import type { Props } from "./props";

export type SearchDependencies = Pick<Props, "search" | "onResults">;
export type SearchUsers = Awaited<ReturnType<Props["search"]>>;
export type SearchView = Readonly<{ q: string }> &
  (
    | Readonly<{ status: "idle" | "loading" | "error" }>
    | Readonly<{ status: "ready"; items: SearchUsers }>
  );
export type SearchController = Readonly<{
  view: Readable<SearchView>;
  edit: (q: string) => void;
  submit: () => Promise<void>;
  dispose: () => void;
}>;
export type SearchOwner = {
  q: string;
  generation: number;
  disposed: boolean;
  pending: AbortController | undefined;
};
