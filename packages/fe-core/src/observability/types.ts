import type {
  Adapter,
  Correlation,
  Identity,
  LogRecord,
  Outcome,
  Result,
} from "./contracts";

export type ObservabilityServiceOptions = Readonly<{
  identity: Identity;
  adapters?: readonly Adapter[];
  clock: () => number;
  uuid: () => string;
  context: () => Correlation;
  config?: { authority?: string };
}>;

export type ObservabilityOperation = Readonly<{
  id: string;
  start(): void;
  adopt(correlation: Correlation): void;
  event(attributes?: Record<string, unknown>): void;
  complete(
    outcome: Outcome,
    result?: Result,
    attributes?: Record<string, unknown>,
  ): void;
  isComplete(): boolean;
}>;

export type ObservabilityService = Readonly<{
  operation(name: string): ObservabilityOperation;
  emit(record: LogRecord): boolean;
  exception(
    error: unknown,
    options?: {
      correlation?: Correlation;
      attributes?: Record<string, unknown>;
      dependency?: string;
    },
  ): boolean;
}>;
