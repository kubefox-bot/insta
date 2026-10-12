import { Result } from "@bloodyowl/boxed";
import { elapsedUpdateMs } from "../conts";
import type { RecorderError, Recording } from "../types";
import type { ActiveRecording, RecordingDependencies } from "./types";

class RecordingLifecycle implements ActiveRecording {
  private readonly completion =
    Promise.withResolvers<Result<Recording, RecorderError>>();
  private readonly chunks: Blob[] = [];
  private startedAt = 0;
  private elapsedMs = 0;
  private stopping = false;
  private settled = false;
  private failure: RecorderError | undefined = undefined;
  private timer: unknown = undefined;
  /** Начальное пустое снятие native-подписки, заменяемое после подключения событий записи. */
  private unsubscribe = () => {};
  /** Начальное пустое снятие подписки видимости, заменяемое при запуске capture. */
  private unsubscribeVisibility = () => {};
  /** Сохраняет зависимости одной записи; таймеры и native события подключаются при start. */
  constructor(private readonly dependencies: RecordingDependencies) {}

  /** Вычисляет прошедшие миллисекунды по инжектированным часам относительно начала записи. */
  private readonly elapsed = () => this.dependencies.clock() - this.startedAt;
  /** Отменяет принадлежащий записи таймер, если он установлен, и очищает его handle. */
  private readonly clearTimer = () => {
    if (this.timer !== undefined)
      this.dependencies.timers.clearTimeout(this.timer);
    this.timer = undefined;
  };
  /** Однократно снимает таймер и подписки, освобождает capture и собирает Blob либо ошибку; затем ожидает необязательную финализацию перед разрешением результата. */
  private readonly settle = () => {
    if (this.settled) return;
    this.settled = true;
    this.clearTimer();
    this.unsubscribeVisibility();
    this.unsubscribe();
    this.dependencies.release();
    const mimeType = this.dependencies.session.mimeType;
    const outcome: Result<Recording, RecorderError> = this.failure
      ? Result.Error(this.failure)
      : Result.Ok({
          blob: new Blob(this.chunks, { type: mimeType }),
          mimeType,
          elapsedMs: this.elapsedMs,
        });
    this.chunks.length = 0;
    if (outcome.isError() || !this.dependencies.finalizeRecording) {
      this.complete(outcome);
      return;
    }
    this.finalize(outcome.get()).then(this.complete);
  };
  /** Передаёт запись финализатору; его исключение становится finalization-failed, отсутствие финализатора сохраняет исходную запись. */
  private readonly finalize = async (
    recording: Recording,
  ): Promise<Result<Recording, RecorderError>> => {
    try {
      return this.dependencies.finalizeRecording
        ? await this.dependencies.finalizeRecording(recording)
        : Result.Ok(recording);
    } catch (cause) {
      return Result.Error({ code: "finalization-failed", cause });
    }
  };
  /** Публикует recorded либо error и разрешает единый promise результата записи. */
  private readonly complete = (outcome: Result<Recording, RecorderError>) => {
    this.dependencies.update(
      outcome.isError()
        ? { status: "error", error: outcome.getError() }
        : { status: "recorded" },
    );
    this.completion.resolve(outcome);
  };
  /** Однократно запрашивает stop и фиксирует elapsedMs; при исключении освобождает capture, сохраняя listeners и ожидание фактического stop с последними данными. */
  readonly stop = () => {
    if (this.stopping || this.settled) return this.completion.promise;
    this.stopping = true;
    this.elapsedMs = this.elapsed();
    this.clearTimer();
    this.unsubscribeVisibility();
    this.unsubscribeVisibility = () => {};
    this.dependencies.update({ status: "stopping" });
    try {
      this.dependencies.session.stop();
    } catch (cause) {
      this.failure = { code: "recorder-failed", cause };
      // End camera/microphone capture even when native stop has an unknown outcome.
      // Keep the recorder listeners until stop settlement, including queued final data.
      this.dependencies.release();
    }
    return this.completion.promise;
  };
  /** Обновляет elapsedMs и планирует следующий ограниченный таймер; по достижении лимита запрашивает остановку, учитывая повторные переходы из update. */
  private readonly tick = () => {
    if (this.stopping || this.settled) return;
    const elapsedMs = this.elapsed();
    if (elapsedMs >= this.dependencies.maxDurationMs) {
      this.stop();
      return;
    }
    this.dependencies.update({ status: "recording", elapsedMs });
    if (this.stopping || this.settled) return;
    this.timer = this.dependencies.timers.setTimeout(
      this.tick,
      Math.min(elapsedUpdateMs, this.dependencies.maxDurationMs - elapsedMs),
    );
  };
  /** Подключает события, запускает native запись и ограничивает её временем/видимостью; синхронный отказ start завершает запись ошибкой и освобождает ресурсы. */
  readonly start = (): Result<undefined, RecorderError> => {
    this.unsubscribe = this.dependencies.session.subscribe({
      /** Накапливает непустые native chunks до settlement; данные после завершения игнорируются. */
      data: (chunk) => {
        if (!this.settled && chunk.size) this.chunks.push(chunk);
      },
      /** При native stop фиксирует длительность самопроизвольной остановки и завершает сбор данных. */
      stop: () => {
        if (!this.stopping) this.elapsedMs = this.elapsed();
        this.settle();
      },
      /** Запоминает native ошибку как итог записи и запрашивает остановку. */
      error: (cause) => {
        this.failure = { code: "recorder-failed", cause };
        this.stop();
      },
    });
    this.startedAt = this.dependencies.clock();
    try {
      this.dependencies.session.start();
    } catch (cause) {
      this.failure = { code: "recorder-failed", cause };
      this.settle();
      return Result.Error(this.failure);
    }
    this.dependencies.update({ status: "recording", elapsedMs: 0 });
    if (this.stopping || this.settled) return Result.Ok(undefined);
    this.unsubscribeVisibility = this.dependencies.visibility.subscribe(() => {
      this.stop();
    });
    if (this.dependencies.visibility.isHidden()) this.stop();
    else
      this.timer = this.dependencies.timers.setTimeout(
        this.tick,
        Math.min(elapsedUpdateMs, this.dependencies.maxDurationMs),
      );
    return Result.Ok(undefined);
  };
}
/** Создаёт жизненный цикл одной native сессии; переданный release назначает ему освобождение capture при завершении. */
export const createRecording = (
  dependencies: RecordingDependencies,
): ActiveRecording => new RecordingLifecycle(dependencies);
