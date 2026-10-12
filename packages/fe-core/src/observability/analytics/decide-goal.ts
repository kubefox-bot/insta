import { Result } from "@bloodyowl/boxed";
import type { DispatchError, GoalDispatch } from "./types";
/** Отправляет только разрешённую server-canonical цель после проверки текущего consent и необязательного claim. Передаёт sink ограниченную проекцию и signal; сохраняет claim после успеха и различает no_goal, duplicate и недоступность границ. Проверка и сохранение claim здесь не атомарны. */
export const dispatchGoal = async ({
  record,
  mapping,
  sink,
  permission,
  claims,
  signal,
}: GoalDispatch): Promise<
  Result<"recorded" | "duplicate" | "no_goal", DispatchError>
> => {
  if (
    record.authority !== "server_canonical" ||
    mapping.authority !== record.authority ||
    record.operation.startsWith("internal.") ||
    mapping.operation !== record.operation ||
    !mapping.goal ||
    !mapping.successCodes.includes(record.code) ||
    !record.reference
  )
    return Result.Ok("no_goal");
  try {
    const allowed = await permission(record.reference);
    if (allowed === "unavailable")
      return Result.Error("permission_unavailable");
    if (allowed === "denied") return Result.Ok("no_goal");
  } catch {
    return Result.Error("permission_unavailable");
  }
  const key = `${sink.name}:${record.analyticsEventId}`;
  try {
    if (await claims?.has(key)) return Result.Ok("duplicate");
  } catch {
    return Result.Error("claim_unavailable");
  }
  try {
    // Copy only the approved projection. Consent context and provider payloads never reach a sink.
    const result = await sink.record(
      {
        analyticsEventId: record.analyticsEventId,
        effectId: record.effectId,
        operationId: record.operationId,
        operation: record.operation,
        code: record.code,
        authority: "server_canonical",
        occurredAt: record.occurredAt,
        goal: mapping.goal,
      },
      signal,
    );
    if (result.isError()) return result;
    try {
      await claims?.save(key);
    } catch {
      return Result.Error("claim_unavailable");
    }
    return result;
  } catch {
    return Result.Error("sink_unavailable");
  }
};
