export type OptionalAdapter = Readonly<{
  start: () => void | Promise<void>;
  stop: () => void | Promise<void>;
  clear: () => void | Promise<void>;
}>;
export type OptionalTelemetry = Readonly<{
  start: (
    state: import("@insta/contracts/privacy").PublicPreference,
  ) => Promise<void>;
  stop: () => Promise<void>;
}>;
