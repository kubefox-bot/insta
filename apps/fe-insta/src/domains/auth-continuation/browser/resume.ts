import { safeTarget } from "../domain/intent";
import { openTarget } from "./open-target";
import type { ResumeDependencies, ResumeSelection } from "./types";
/**
 * Создаёт продолжение с объединением активных запросов по intent и защитой поколения/выбора;
 * отмечает исход unknown до открытия, чтобы не повторить возможный эффект после сбоя.
 */
export const createResume = ({
  resolveResume,
  currentGeneration,
  openConversation,
  openStory,
  onResumed,
  onRejected,
}: ResumeDependencies) => {
  const pending = new Map<
    string,
    Readonly<{ operation: Promise<boolean>; isSelected: () => boolean }>
  >();
  const outcomes = new Map<string, "completed" | "unknown">();
  /**
   * Разрешает цель для текущего поколения и выбранного intent, однократно открывает её и
   * отмечает completed только после успешного callback; unknown не повторяет открытие.
   */
  const resolve = async (intentId: string, isSelected: () => boolean) => {
    const generation = currentGeneration();
    if (!generation) return false;
    const target = await resolveResume(intentId);
    if (
      !target ||
      !safeTarget(target) ||
      currentGeneration() !== generation ||
      !isSelected()
    )
      return false;
    const previous = outcomes.get(intentId);
    if (previous) return previous === "completed";
    // Claim before effect so simultaneous callbacks cannot open twice.
    outcomes.set(intentId, "unknown");
    await openTarget(target, { openConversation, openStory });
    if (currentGeneration() !== generation) return false;
    onResumed?.({ intentId, target });
    outcomes.set(intentId, "completed");
    return true;
  };
  return ({ intentId, isSelected = () => true }: ResumeSelection) => {
    const current = pending.get(intentId);
    if (current?.isSelected()) return current.operation;
    const generation = currentGeneration();
    const operation = resolve(intentId, isSelected)
      .catch(() => false)
      .then((result) => {
        if (
          !result &&
          generation &&
          currentGeneration() === generation &&
          isSelected()
        )
          onRejected?.(intentId);
        return result;
      })
      .finally(() => {
        if (pending.get(intentId)?.operation === operation)
          pending.delete(intentId);
      });
    pending.set(intentId, { operation, isSelected });
    return operation;
  };
};
