import type { Readable } from "svelte/store";
import type { AuthBrowserIssueCode } from "./codes";
export type Actor = Readonly<{
  userId: string;
  username: string;
  generation: string;
}>;
export type AuthView = Readonly<{
  actor: Actor | null;
  status: "guest" | "authenticated" | "unavailable" | "pending";
  issue?: AuthBrowserIssueCode;
  revocation?: "pending" | "confirmed";
}>;
export type AuthBrowser = Readonly<{
  view: Readable<AuthView>;
  registerPrivate: (cleanup: () => void) => () => void;
  reconcile: (options?: Readonly<{ signal?: AbortSignal }>) => Promise<void>;
  reconcileNavigation: (snapshot: AuthView) => Promise<void>;
  exclusive: <T>(execute: () => Promise<T>) => Promise<T>;
  accept: (actor: Actor | null) => void;
  clearSubmissionIssue: () => void;
  reportPrivateCleanupFailure: () => void;
  registerLogout: (
    cleanup: (actor: Actor | null) => Promise<void>,
  ) => () => void;
  beginLogout: () => void | Promise<void>;
  finishLogout: (state: "pending" | "confirmed") => void;
  mount: () => () => void;
}>;
export type AuthSynchronization = Readonly<{
  exclusive: <T>(execute: () => Promise<T>) => Promise<T>;
  publish: () => void;
  publishLogout?: () => void;
  subscribe: (refresh: () => void, onExplicitLogout?: () => void) => () => void;
}>;
