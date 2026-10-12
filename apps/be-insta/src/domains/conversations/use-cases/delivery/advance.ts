import type { DeliveryRuntimePorts } from "../../ports/delivery/types";
import { deliverNext } from "./deliver";
import type { DeliveryRunInput, DeliveryRunState } from "./types";
/** Применяет результат одной отправки; только exact applied заменяет cursor, не перенося token в provider position. */
export const advanceDelivery = async (
  input: DeliveryRunInput,
  state: DeliveryRunState,
  ports: DeliveryRuntimePorts,
) => {
  const attempt = state.pending;
  if (!attempt) throw new Error("Delivery attempt is missing");
  const step = await deliverNext(
    {
      subscription: {
        actor: input.actor,
        target: input.target,
        attempt,
        failures: state.failures,
        retries: state.retries,
      },
      signal: input.signal,
    },
    ports,
  );
  switch (step.kind) {
    case "acked":
      state.position = {
        streamId: attempt.expected.streamId,
        epoch: attempt.expected.epoch,
        cursor: attempt.expected.cursor,
      };
      state.pending = undefined;
      state.failures = step.failures;
      state.retries = step.retries;
      return "continue" as const;
    case "retry":
      state.failures = step.failures;
      state.retries = step.retries;
      await ports.wait({ delayMs: step.delayMs, signal: input.signal });
      return "continue" as const;
    case "blocked":
    case "resync-required":
    case "unauthorized":
    case "closed":
      return step.kind;
    default:
      return step satisfies never;
  }
};
