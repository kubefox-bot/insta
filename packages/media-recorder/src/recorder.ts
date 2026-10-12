import { Result } from "@bloodyowl/boxed";
import {
  browserTimers,
  browserVisibility,
  checkSupport,
  permissionError,
} from "./capabilities";
import { notifySubscriber } from "./lib/subscriptions/notify";
import { createRecording } from "./recording/create";
import type { ActiveRecording } from "./recording/types";
import { createTrackRelease } from "./release";
import type {
  Recorder,
  RecorderError,
  RecorderOptions,
  RecorderState,
  SupportedRecorder,
} from "./types";

class RecorderController implements Recorder {
  private readonly subscribers = new Set<(state: RecorderState) => void>();
  private readonly release = createTrackRelease();
  private view: RecorderState = { status: "idle" };
  private stream: MediaStream | undefined = undefined;
  private permission: Promise<Result<MediaStream, RecorderError>> | undefined =
    undefined;
  private recording: ActiveRecording | undefined = undefined;
  private disposal: Promise<void> | undefined = undefined;
  private disposed = false;
  /** Сохраняет зависимости контроллера без запроса разрешения, создания потока или запуска записи. */
  constructor(private readonly options: RecorderOptions) {}

  /** Обновляет view и уведомляет подписчиков; прекращает старый обход при повторном изменении view и не оживляет disposed-контроллер. */
  private readonly update = (view: RecorderState) => {
    if (this.disposed && view.status !== "disposed") return;
    this.view = view;
    for (const subscriber of this.subscribers) {
      if (this.view !== view) return;
      notifySubscriber({ subscriber, state: view });
    }
  };
  /** Различает окончательно освобождённый контроллер и недопустимый переход текущего состояния. */
  private readonly invalid = (): RecorderError => ({
    code: this.disposed ? "disposed" : "invalid-state",
  });
  /** Возвращает выбранный MIME без capture; после dispose возвращает ошибку disposed. */
  readonly checkSupport: Recorder["checkSupport"] = () => {
    if (this.disposed) return Result.Error(this.invalid());
    return checkSupport(this.options).map(({ mimeType }) => ({ mimeType }));
  };
  /** Принимает поток только с audio и video tracks; поздний после dispose или неполный поток освобождает, иначе переводит preview в ready. */
  private readonly acceptPreview = (
    stream: MediaStream,
  ): Result<MediaStream, RecorderError> => {
    if (this.disposed) {
      this.release(stream);
      return Result.Error({ code: "disposed" });
    }
    if (!stream.getAudioTracks().length || !stream.getVideoTracks().length) {
      this.release(stream);
      const error: RecorderError = { code: "device-unavailable" };
      this.update({ status: "error", error });
      return Result.Error(error);
    }
    this.stream = stream;
    this.update({ status: "ready" });
    return Result.Ok(stream);
  };
  /** Запрашивает getUserMedia и преобразует отказ в состояние ошибки; поздний успешный поток проверяется владельцем preview. */
  private readonly acquirePreview = (supported: SupportedRecorder) => {
    return Promise.resolve()
      .then(() => supported.devices.getUserMedia(supported.constraints))
      .then(this.acceptPreview, (cause) => {
        const error = this.disposed ? this.invalid() : permissionError(cause);
        this.update({ status: "error", error });
        return Result.Error(error);
      });
  };
  /** Открывает preview из idle, объединяя параллельные запросы разрешения; готовый поток переиспользуется, остальные состояния отклоняются. */
  readonly openPreview: Recorder["openPreview"] = () => {
    if (this.disposed) return Promise.resolve(Result.Error(this.invalid()));
    if (this.view.status === "ready" && this.stream)
      return Promise.resolve(Result.Ok(this.stream));
    if (this.view.status === "requesting-permission" && this.permission)
      return this.permission;
    if (this.view.status !== "idle")
      return Promise.resolve(Result.Error(this.invalid()));
    const supported = checkSupport(this.options);
    if (supported.isError()) {
      this.update({ status: "error", error: supported.getError() });
      return Promise.resolve(Result.Error(supported.getError()));
    }
    this.permission = this.acquirePreview(supported.get());
    this.update({ status: "requesting-permission" });
    return this.permission;
  };
  /** Создаёт и запускает запись из ready с текущим потоком; ошибка создания освобождает tracks и переводит контроллер в error. */
  readonly start: Recorder["start"] = () => {
    if (this.disposed || this.view.status !== "ready" || !this.stream)
      return Result.Error(this.invalid());
    const supported = checkSupport(this.options);
    if (supported.isError()) return Result.Error(supported.getError());
    const stream = this.stream;
    try {
      const { factory, mimeType } = supported.get();
      this.recording = createRecording({
        session: factory.create(stream, mimeType),
        maxDurationMs: this.options.maxDurationMs,
        clock: this.options.clock ?? (() => performance.now()),
        timers: this.options.timers ?? browserTimers,
        visibility: this.options.visibility ?? browserVisibility,
        update: this.update,
        finalizeRecording: this.options.finalizeRecording,
        /** Освобождает захваченный поток через общий реестр tracks и удаляет ссылку контроллера. */
        release: () => {
          this.release(stream);
          this.stream = undefined;
        },
      });
      return this.recording.start();
    } catch (cause) {
      this.release(stream);
      this.stream = undefined;
      const error: RecorderError = { code: "recorder-failed", cause };
      this.update({ status: "error", error });
      return Result.Error(error);
    }
  };
  /** Возвращает завершение активной записи либо ошибку состояния, если запись ещё не создана. */
  readonly stop: Recorder["stop"] = () =>
    this.recording?.stop() ?? Promise.resolve(Result.Error(this.invalid()));
  /** Запрашивает остановку записи, дожидается permission и settlement, затем освобождает оставшийся поток; неизвестный native stop может удерживать ожидание. */
  private readonly releaseOwnedResources = async () => {
    const stopping = this.recording?.stop();
    if (this.permission) await this.permission;
    if (stopping) await stopping;
    if (this.stream) {
      this.release(this.stream);
      this.stream = undefined;
    }
  };
  /** Идемпотентно запрещает дальнейшие переходы, публикует disposed и снимает подписчиков; возвращает общее ожидание освобождения ресурсов. */
  readonly dispose = () => {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    this.disposal = this.releaseOwnedResources();
    this.update({ status: "disposed" });
    this.subscribers.clear();
    return this.disposal;
  };
  /** Сразу сообщает текущий view и подписывает на последующие изменения до dispose; возвращает удаление этого подписчика. */
  readonly subscribe: Recorder["subscribe"] = (subscriber) => {
    notifySubscriber({ subscriber, state: this.view });
    if (!this.disposed) this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  };
}
/** Создаёт независимый контроллер preview/записи, владеющий полученными tracks; эффекты начинаются при вызове его операций. */
export const createRecorder = (options: RecorderOptions): Recorder =>
  new RecorderController(options);
