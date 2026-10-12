import type { Result as BusinessResult, Correlation } from "../contracts/types";
import type { ObservabilityService } from "../types";

export type BusinessDiagnosticRecord =
  | (Readonly<{
      type: "violation";
      operation: string;
      code: "missing_outcome" | "multi_completion";
    }> &
      Readonly<Record<"operation_id", string>>)
  | (Readonly<{
      type: "event";
      operation: string;
      event: string;
      attributes?: Record<string, unknown>;
    }> &
      Readonly<Record<"operation_id", string>>)
  | (Readonly<{
      type: "error";
      operation: string;
      error: unknown;
      code?: string;
      attributes?: Record<string, unknown>;
    }> &
      Readonly<Record<"operation_id", string>>)
  | (Readonly<{
      type: "frontend_failure";
      operation: string;
      phase: "post_confirmation";
      code: "FRONTEND_UI_EFFECT_FAILED";
      error: unknown;
    }> &
      Readonly<Partial<Record<"operation_id", string>>>);

export type BusinessOperation = Readonly<{
  id: string;
  adopt(operationId: string): void;
  correlate(correlation: Omit<Correlation, "operation_id">): void;
  pending(): void;
  succeeded(code: string): void;
  failed(error: unknown, code?: string, result?: BusinessResult): void;
  rejected(code: string, error?: unknown, result?: BusinessResult): void;
  attributes(values: Record<string, unknown>): void;
  event(name: string): void;
  isComplete(): boolean;
}>;

export type BusinessObserverOptions = Readonly<{
  runtime: ObservabilityService;
  normalizeSuccess: (code: string) => BusinessResult;
  classifyFailure: (error: unknown) => Readonly<{
    outcome: "rejected" | "failed";
    result?: BusinessResult;
    correlation?: Correlation;
  }>;
  emit: (record: BusinessDiagnosticRecord) => void | Promise<void>;
}>;

export type BusinessObserver = Readonly<{
  observeOperation<T>(
    name: string,
    callback: (operation: BusinessOperation) => Promise<T>,
  ): Promise<T>;
  runConfirmedEffect(
    effect: (() => unknown) | undefined,
    operation: string,
    operationId?: string,
  ): Promise<void>;
}>;
