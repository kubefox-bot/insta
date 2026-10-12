import type { Recorder, RecorderState, Recording } from "@insta/media-recorder";
import { readonly, writable } from "svelte/store";
import type { CameraView } from "./types";

class Camera {
  private readonly store = writable<CameraView>({
    state: { status: "idle" },
    stream: null,
  });
  readonly view = readonly(this.store);
  private recorder: Recorder | undefined = undefined;
  private unsubscribe: (() => void) | undefined = undefined;
  private epoch = 0;
  private completion: Promise<void> | undefined = undefined;
  private disposal: Promise<void> = Promise.resolve();
  /** Сохраняет фабрику recorder и получателя готовой записи; собственные подписки и recorder освобождаются через release. */
  constructor(
    private readonly dependencies: Readonly<{
      factory: () => Recorder;
      onRecorded: (recording: Recording) => void;
    }>,
  ) {}
  /** Инвалидирует поколение камеры, снимает подписку и сбрасывает вид; возвращает Promise совокупного освобождения recorder. */
  readonly release = () => {
    this.epoch++;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    const recorder = this.recorder;
    this.recorder = undefined;
    this.completion = undefined;
    this.store.set({ state: { status: "idle" }, stream: null });
    this.disposal = Promise.all([this.disposal, recorder?.dispose()]).then(
      () => {},
    );
    return this.disposal;
  };
  /** Разделяет завершение stop между вызывающими, принимает запись только своего поколения и дожидается dispose recorder. */
  readonly stop = () => {
    if (this.completion) return this.completion;
    const recorder = this.recorder;
    const epoch = this.epoch;
    if (!recorder) return Promise.resolve();
    this.completion = recorder.stop().then(async (result) => {
      if (this.epoch !== epoch) return;
      if (result.isError())
        this.store.set({
          state: { status: "error", error: result.getError() },
          stream: null,
        });
      else this.dependencies.onRecorded(result.get());
      this.unsubscribe?.();
      this.unsubscribe = undefined;
      this.recorder = undefined;
      await recorder.dispose();
    });
    return this.completion;
  };
  /** Проецирует состояние recorder, скрывая поток вне ready/recording; автоматическое recorded завершает через общий stop. */
  private readonly update = (snapshot: RecorderState) => {
    this.store.update((current) => ({
      state: snapshot,
      stream:
        snapshot.status === "ready" || snapshot.status === "recording"
          ? current.stream
          : null,
    }));
    if (snapshot.status === "recorded")
      this.stop().catch(() =>
        this.store.set({
          state: { status: "error", error: { code: "recorder-failed" } },
          stream: null,
        }),
      );
  };
  /** Дожидается прежнего освобождения, создаёт recorder и открывает preview; поздние результаты игнорирует, ошибку открытия сопровождает очисткой. */
  readonly enable = async () => {
    if (this.recorder) return;
    const epoch = this.epoch;
    await this.disposal;
    if (epoch !== this.epoch || this.recorder) return;
    const recorder = this.dependencies.factory();
    this.recorder = recorder;
    this.unsubscribe = recorder.subscribe((snapshot) => {
      if (epoch === this.epoch) this.update(snapshot);
    });
    const result = await recorder.openPreview();
    if (epoch !== this.epoch) return;
    if (result.isOk()) {
      this.store.set({ state: { status: "ready" }, stream: result.get() });
      return;
    }
    await recorder.dispose();
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.recorder = undefined;
    this.store.set({
      state: { status: "error", error: result.getError() },
      stream: null,
    });
  };
  /** Запускает существующий recorder и переносит ожидаемый отказ в состояние камеры. */
  readonly start = () => {
    const outcome = this.recorder?.start();
    if (outcome?.isError())
      this.store.set({
        state: { status: "error", error: outcome.getError() },
        stream: null,
      });
  };
}
/** Отдаёт поток только для заимствованного отображения; нативный recorder сохраняет владение tracks и освобождает их. */
export const createCamera = (
  dependencies: ConstructorParameters<typeof Camera>[0],
) => new Camera(dependencies);
