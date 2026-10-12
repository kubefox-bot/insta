import { Result } from "@bloodyowl/boxed";
import { StoryErrorCode } from "@insta/contracts/errors";
import type { MediaInspector } from "../../ports/media-inspector/interfaces";
import { inspectionPolicy } from "./conts";
import type { InspectionOperation } from "./types";
/**
 * Владеет capacity, deadline-контроллерами и активными inspection promise; close
 * прекращает admission и запрашивает их отмену.
 */
export const createInspectionPool = ({
  inspectSource,
}: Readonly<{ inspectSource: InspectionOperation }>): MediaInspector & {
  readonly close: () => Promise<void>;
} => {
  const active = new Map<AbortController, Promise<unknown>>();
  let closed = false;
  /**
   * Отклоняет закрытый/заполненный пул и истёкший deadline, затем регистрирует inspection
   * с ограниченным таймером. Слот и таймер освобождает после settlement.
   */
  const inspect: MediaInspector["inspect"] = async (input) => {
    if (closed) return Result.Error(StoryErrorCode.InspectorUnavailable);
    if (active.size >= inspectionPolicy.maxWorkers)
      return Result.Error(StoryErrorCode.Busy);
    const controller = new AbortController();
    const remaining = Math.min(
      input.deadline - Date.now(),
      inspectionPolicy.deadlineMs,
    );
    if (!Number.isFinite(remaining) || remaining <= 0)
      return Result.Error(StoryErrorCode.Deadline);
    const timer = setTimeout(() => controller.abort(), remaining);
    const pending = inspectSource({ input, signal: controller.signal });
    active.set(controller, pending);
    try {
      return await pending;
    } finally {
      clearTimeout(timer);
      active.delete(controller);
    }
  };
  return {
    inspect,
    /**
     * Закрывает admission, отменяет все активные inspections и ожидает их через
     * Promise.all; rejection не маскирует.
     */
    close: async () => {
      closed = true;
      for (const controller of active.keys()) controller.abort();
      await Promise.all(active.values());
    },
  };
};
