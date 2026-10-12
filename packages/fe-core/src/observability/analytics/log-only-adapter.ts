import { Result } from "@bloodyowl/boxed";
import { logFields, SCHEMA_VERSION } from "../contracts/conts";
import type { GoalProjection, GoalSink } from "./types";
/** Создаёт log-only sink для уже разрешённой проекции цели; проверка consent остаётся у dispatchGoal. */
export const createLogOnlySink = ({
  emit,
}: Readonly<{
  emit: (
    record: Readonly<
      Record<"schema_version", typeof SCHEMA_VERSION> &
        Record<"event_type", "analytics"> & { analytics: GoalProjection }
    >,
  ) => void;
}>): GoalSink => ({
  name: "log_only",
  /** Передаёт analytics projection в emit с версией схемы и превращает синхронный отказ emit в sink_unavailable. */
  record: async (analytics) => {
    try {
      emit({
        [logFields.schemaVersion]: SCHEMA_VERSION,
        [logFields.eventType]: "analytics",
        analytics,
      });
      return Result.Ok("recorded");
    } catch {
      return Result.Error("sink_unavailable");
    }
  },
});
