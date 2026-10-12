export type AuthAdapterOptions = Readonly<{
  online?: () => boolean;
  offlineEvents?: Pick<EventTarget, "addEventListener" | "removeEventListener">;
}>;
