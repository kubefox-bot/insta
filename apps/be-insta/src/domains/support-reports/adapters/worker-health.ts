import type { DeliveryHealthInput } from "./types";

/**
 * Повышает приоритет retry над accepted; пустой проход сохраняет прежнее здоровье
 * доставки.
 */
export const deliveryHealth = ({ previous, summary }: DeliveryHealthInput) => {
  if (summary.retry > 0) return "degraded";
  if (summary.accepted > 0) return "ok";
  return previous;
};
