import { Result } from "@bloodyowl/boxed";
import {
  defaultConstraints,
  defaultMimeCandidates,
  permissionErrorCodes,
} from "./conts";
import type {
  RecorderError,
  RecorderFactory,
  RecorderOptions,
  RecorderTimers,
  RecorderVisibility,
  SupportedRecorder,
} from "./types";

/** Возвращает адаптер native MediaRecorder либо отсутствие поддержки; сам поток и разрешение камеры здесь не запрашиваются. */
export const browserRecorderFactory = (): RecorderFactory | undefined => {
  if (typeof MediaRecorder === "undefined") return undefined;
  return {
    /** Проверяет заявленную браузером поддержку MIME; успешная проверка не гарантирует успешный запуск записи. */
    isTypeSupported: (mimeType) => MediaRecorder.isTypeSupported(mimeType),
    /** Создаёт native recorder для переданного потока и MIME; управление tracks остаётся у владельца потока. */
    create: (stream, mimeType) => {
      const recorder = new MediaRecorder(stream, { mimeType });
      return {
        /** Возвращает MIME, сообщаемый созданным native recorder. */
        get mimeType() {
          return recorder.mimeType;
        },
        /** Запускает native запись; синхронная ошибка передаётся владельцу сессии. */
        start: () => recorder.start(),
        /** Запрашивает native остановку только активной записи; завершение приходит отдельным событием stop. */
        stop: () => {
          if (recorder.state !== "inactive") recorder.stop();
        },
        /** Подключает native события и возвращает снятие именно этих обработчиков, не останавливая запись или tracks. */
        subscribe: (events) => {
          /** Передаёт Blob из dataavailable владельцу записи без преобразования содержимого. */
          const data = (event: BlobEvent) => events.data(event.data);
          /** Сообщает владельцу о фактическом native stop после последних данных. */
          const stop = () => events.stop();
          /** Передаёт native событие ошибки владельцу записи для выбора исхода. */
          const error = (event: Event) => events.error(event);
          recorder.addEventListener("dataavailable", data);
          recorder.addEventListener("stop", stop);
          recorder.addEventListener("error", error);
          return () => {
            recorder.removeEventListener("dataavailable", data);
            recorder.removeEventListener("stop", stop);
            recorder.removeEventListener("error", error);
          };
        },
      };
    },
  };
};
/** Возвращает доступные mediaDevices; при отсутствии navigator возвращает undefined. */
export const browserMediaDevices = () =>
  typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
export const browserVisibility: RecorderVisibility = {
  /** Читает видимость документа; вне браузера считает страницу видимой. */
  isHidden: () => typeof document !== "undefined" && document.hidden,
  /** Подписывает обработчик на переход документа в hidden и возвращает снятие подписки; вне браузера возвращает пустое снятие. */
  subscribe: (onHidden) => {
    if (typeof document === "undefined") return () => {};
    /** Вызывает потребителя только при скрытом документе, чтобы завершить активный capture. */
    const changed = () => {
      if (document.hidden) onHidden();
    };
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  },
};
export const browserTimers: RecorderTimers = {
  /** Планирует callback через глобальный таймер с задержкой в миллисекундах. */
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  /** Отменяет только числовой browser timer; объектные Bun/SSR handles этот адаптер не обслуживает. */
  clearTimeout: (timer) => {
    // Browser IDs are numbers; Bun/SSR IDs may be Timeout objects. This package only schedules in a browser by default.
    if (typeof timer === "number") globalThis.clearTimeout(timer);
  },
};
/** Проверяет положительную длительность, обязательные audio/video и доступность первого поддержанного MIME без запроса разрешения. Сохраняет порядок кандидатов, включая WebM и MP4. */
export const checkSupport = (
  options: RecorderOptions,
): Result<SupportedRecorder, RecorderError> => {
  const constraints = { ...defaultConstraints, ...options.constraints };
  if (
    !Number.isFinite(options.maxDurationMs) ||
    options.maxDurationMs <= 0 ||
    !constraints.audio ||
    !constraints.video
  )
    return Result.Error({ code: "invalid-options" });
  const factory = options.recorderFactory ?? browserRecorderFactory();
  const devices = options.mediaDevices ?? browserMediaDevices();
  if (!factory || !devices) return Result.Error({ code: "unsupported" });
  const mimeType = (options.mimeCandidates ?? defaultMimeCandidates).find(
    (candidate) => factory.isTypeSupported(candidate),
  );
  return mimeType
    ? Result.Ok({ mimeType, factory, devices, constraints })
    : Result.Error({ code: "unsupported" });
};
/** Классифицирует ошибку доступа к устройствам по имени Error, сохраняя cause; неизвестные причины становятся device-failed. */
export const permissionError = (cause: unknown): RecorderError => {
  const name = cause instanceof Error ? cause.name.toLowerCase() : "";
  const code = Object.hasOwn(permissionErrorCodes, name)
    ? permissionErrorCodes[name as keyof typeof permissionErrorCodes]
    : "device-failed";
  return { code, cause };
};
