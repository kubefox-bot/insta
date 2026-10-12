import type { Choice, PublicPreference } from "@insta/contracts/privacy";
import type { Readable } from "svelte/store";
export type PreferenceState = Readonly<{
  preference: PublicPreference;
  status: "ready" | "saving" | "error";
}>;
export type PrivacyBrowser = Readonly<{
  view: Readable<ViewState>;
  change: (choice: Choice) => Promise<void>;
  refresh: () => Promise<void>;
  mount: () => () => void;
}>;
export type Synchronization = Readonly<{
  exclusive: <T>(execute: () => Promise<T>) => Promise<T>;
  publish: () => void;
  subscribe: (refresh: () => void) => () => void;
}>;
export type BrowserOwner = Readonly<{
  state: {
    current: PublicPreference;
    epoch: number;
    lifetime: number;
    mutationEpoch: number;
    locallyDenied: boolean;
    mounted: boolean;
  };
  view: import("svelte/store").Writable<PreferenceState>;
  preferences: import("../ports/preferences").Preferences;
  telemetry: import("../ports/optional-telemetry").OptionalTelemetry;
  synchronization: Synchronization;
}>;
export type OptionalState = {
  epoch: number;
  revision?: number | undefined;
  active: Set<import("../ports/optional-telemetry").OptionalAdapter>;
  cleaning: Map<
    import("../ports/optional-telemetry").OptionalAdapter,
    Promise<void>
  >;
};
export type ViewState = PreferenceState & Readonly<{ needsChoice: boolean }>;
