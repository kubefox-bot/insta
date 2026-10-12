import { Result } from "@bloodyowl/boxed";
import type { RealtimeObservation } from "./types";
/**
 * Возвращает наблюдатель, проверяющий разрешение перед каждой записью. Отказ или ошибка
 * чтения разрешения даёт disabled, ошибка записи — unavailable; сбой необязательной
 * диагностики не выбрасывается наружу.
 */
export const createConnectionObserver =
  ({
    readPermission,
    record,
  }: Readonly<{
    readPermission: () => "allowed" | "denied";
    record: (observation: RealtimeObservation) => void;
  }>) =>
  (observation: RealtimeObservation) => {
    const permission = Result.fromExecution(readPermission);
    if (permission.isError() || permission.get() !== "allowed")
      return "disabled" as const;
    return Result.fromExecution(() => record(observation)).isOk()
      ? ("recorded" as const)
      : ("unavailable" as const);
  };
