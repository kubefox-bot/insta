import type {
  createPinoAdapter,
  createTracing,
  PinoAdapterOptions,
} from "@insta/fe-core/observability/server";
export type ObservabilityOptions =
  | Readonly<{ mode: "offline" }>
  | Readonly<{
      mode: "runtime";
      level: "debug" | "info" | "warn" | "error";
      flushTimeoutMs: number;
      destination?: PinoAdapterOptions["destination"];
    }>;
export type RuntimeObservability = Readonly<{
  adapter: ReturnType<typeof createPinoAdapter>;
  tracing: ReturnType<typeof createTracing>;
  close(): Promise<void>;
}>;
