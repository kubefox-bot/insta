import { horizonObservation } from "../conts";
import type { HorizonDependencies } from "./types";

class HorizonObservation {
  private released = false;
  private timer: unknown = undefined;
  private readonly timers: NonNullable<HorizonDependencies["timers"]>;
  private readonly listeners = {
    /** Пересчитывает прогресс и оставшееся наблюдение при продвижении видео. */
    timeupdate: () => this.update(),
    /** Пересчитывает серверный горизонт после перемотки. */
    seeked: () => this.update(),
    /** Возобновляет проверку горизонта при фактическом проигрывании. */
    playing: () => this.update(),
    /** Пересчитывает прогресс и снимает таймер при паузе. */
    pause: () => this.update(),
    /** Завершает текущий просмотр по событию окончания видео. */
    ended: () => this.finish(),
    /** Сообщает о готовности данных только для всё ещё активного выбора. */
    loadeddata: () => {
      if (this.isActive()) this.dependencies.onPrepared();
    },
    /** Освобождает текущий медиаресурс при ошибке и уведомляет владельца выбора. */
    error: () => {
      if (!this.isActive()) return;
      this.dispose();
      this.dependencies.onError();
    },
  };
  /** Подписывает наблюдатель на события видео и запускает проверку серверной длительности; dispose снимает слушатели и освобождает элемент. */
  constructor(private readonly dependencies: HorizonDependencies) {
    this.timers = dependencies.timers ?? {
      /** Планирует следующую проверку горизонта браузерным таймером. */
      setTimeout: (callback, delayMs) =>
        globalThis.setTimeout(callback, delayMs),
      /** Отменяет браузерный таймер, если его идентификатор имеет ожидаемую числовую форму. */
      clearTimeout: (timer) => {
        if (typeof timer === "number") globalThis.clearTimeout(timer);
      },
    };
    for (const [event, listener] of Object.entries(this.listeners))
      dependencies.media.addEventListener(event, listener);
    this.update();
  }
  /** Снимает принадлежащий наблюдателю таймер и очищает его идентификатор. */
  private readonly clearTimer = () => {
    if (this.timer !== undefined) this.timers.clearTimeout(this.timer);
    this.timer = undefined;
  };
  /** Проверяет актуальность выбора; устаревшее наблюдение сразу освобождает. */
  private readonly isActive = () => {
    if (this.released) return false;
    if (this.dependencies.isCurrent()) return true;
    this.dispose();
    return false;
  };
  /** Фиксирует полный прогресс и освобождает видео перед уведомлением о завершении. */
  private readonly finish = () => {
    if (!this.isActive()) return;
    this.dependencies.onProgress(1);
    this.dispose();
    this.dependencies.onEnded();
  };
  /** Вычисляет прогресс по currentTime и серверной длительности; завершает просмотр на горизонте и опрашивает только проигрываемое видео. */
  private readonly update = () => {
    this.clearTimer();
    if (!this.isActive()) return;
    const { media, durationMs, onProgress } = this.dependencies;
    const elapsedMs =
      media.currentTime * horizonObservation.millisecondsPerSecond;
    if (elapsedMs >= durationMs) {
      this.finish();
      return;
    }
    onProgress(
      Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs / durationMs) : 0,
    );
    if (!media.paused && !media.ended)
      this.timer = this.timers.setTimeout(
        this.update,
        horizonObservation.pollMs,
      );
  };
  /** Однократно снимает таймер и события, уведомляет владельца и сбрасывает src видео. */
  readonly dispose = () => {
    if (this.released) return;
    this.released = true;
    this.clearTimer();
    const { media, onRelease } = this.dependencies;
    for (const [event, listener] of Object.entries(this.listeners))
      media.removeEventListener(event, listener);
    onRelease?.();
    media.pause();
    media.removeAttribute("src");
    media.load();
  };
}

/** Владеет наблюдением и медиаресурсом до подтверждённой сервером длительности либо освобождения выбора. */
export const observeStoryHorizon = (dependencies: HorizonDependencies) =>
  new HorizonObservation(dependencies);
