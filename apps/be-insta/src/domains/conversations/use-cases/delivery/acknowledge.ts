import { transitionDelivery } from "../../domain/delivery/transition";
import type { TransitionInput } from "../../domain/delivery/types";
/** Применяет ответ только пока lifetime актуален; закрытие всегда сильнее позднего callback. */
export const acknowledgeDelivery = (
  input: TransitionInput & Readonly<{ signal: AbortSignal }>,
) =>
  input.signal.aborted
    ? { kind: "closed" as const }
    : transitionDelivery(input);
