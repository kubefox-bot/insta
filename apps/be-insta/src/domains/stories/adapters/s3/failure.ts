import { storageFailures } from "./conts";
/**
 * Формирует безопасную ошибку операции storage, сохраняя только имя исходной ошибки
 * вместо потенциально секретного сообщения провайдера.
 */
export const storageFailure = ({
  operation,
  cause,
}: Readonly<{ operation: keyof typeof storageFailures; cause: unknown }>) =>
  new Error(storageFailures[operation], {
    cause: cause instanceof Error ? cause.name : "unknown",
  });
