import { buildBusinessLog } from "../builders/builders";
import { logFields } from "../contracts/conts";
import type {
  Correlation,
  LogRecord,
  Outcome,
  Result,
} from "../contracts/types";
import { normalizeCorrelation } from "../normalize/normalize";
import type {
  ObservabilityOperation,
  ObservabilityServiceOptions,
} from "../types";

export class Operation implements ObservabilityOperation {
  private correlation: Correlation = {};
  private started: number | undefined = undefined;
  private active = false;
  private completed = false;

  /** Сохраняет имя и провайдеры одной операции; корреляция и attempted фиксируются только при start. */
  constructor(
    private readonly name: string,
    private readonly options: ObservabilityServiceOptions,
    private readonly send: (record: LogRecord) => boolean,
  ) {}

  /** Возвращает принятый operation ID либо пустую строку, пока корректный ID не назначен. */
  get id(): string {
    return this.correlation.operation_id ?? "";
  }

  /** Читает конечное значение инжектированных часов; исключение или нечисловое время обозначает отсутствием измерения. */
  private time(): number | undefined {
    try {
      const value = this.options.clock();
      return Number.isFinite(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }

  /** Строит business log с текущей корреляцией и отправляет best effort, не передавая ошибки телеметрии бизнес-коду. */
  private emit(
    outcome: Outcome,
    result?: Result,
    attributes?: Record<string, unknown>,
    http?: Record<string, unknown>,
  ): void {
    try {
      this.send(
        buildBusinessLog({
          identity: this.options.identity,
          operation: this.name,
          outcome,
          result,
          correlation: this.correlation,
          authority: this.options.config?.authority,
          attributes,
          http,
        }),
      );
    } catch {
      /* observability is best effort */
    }
  }

  /** Однократно фиксирует начало, дополняет корреляцию контекстом и при необходимости UUID, затем сообщает attempted. */
  start(): void {
    if (this.active) return;
    this.active = true;
    this.started = this.time();
    try {
      this.correlation = {
        ...normalizeCorrelation(this.options.context()),
        ...this.correlation,
      };
    } catch {
      /* context is optional */
    }
    if (!this.correlation.operation_id) {
      try {
        this.correlation = {
          ...this.correlation,
          ...normalizeCorrelation({
            [logFields.operationId]: this.options.uuid(),
          }),
        };
      } catch {
        /* UUID provider is optional */
      }
    }
    this.emit("attempted");
  }

  /** Объединяет принятые correlation IDs с текущими, отбрасывая значения недопустимого формата. */
  adopt(value: Correlation): void {
    this.correlation = { ...this.correlation, ...normalizeCorrelation(value) };
  }

  /** Сообщает промежуточный event без завершения операции. */
  event(attributes?: Record<string, unknown>): void {
    this.emit("event", undefined, attributes);
  }

  /** Однократно фиксирует исход и неотрицательную округлённую длительность; при недоступных часах использует нулевую длительность. */
  complete(
    outcome: Outcome,
    result?: Result,
    attributes?: Record<string, unknown>,
  ): void {
    if (this.completed) return;
    this.completed = true;
    const ended = this.time();
    const elapsed =
      ended === undefined || this.started === undefined
        ? 0
        : ended - this.started;
    this.emit(outcome, result, attributes, {
      [logFields.durationMs]: Number.isFinite(elapsed)
        ? Math.max(0, Math.round(elapsed))
        : 0,
    });
  }

  /** Сообщает, был ли уже зафиксирован terminal или pending outcome через complete. */
  isComplete(): boolean {
    return this.completed;
  }
}
