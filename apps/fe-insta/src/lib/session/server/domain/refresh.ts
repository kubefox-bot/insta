import type { Binding, RefreshDecision } from "../types";
/** Выбирает блокировку, ожидание, захват просроченной lease или новую попытку по сохранённым срокам. Незавершённая попытка допускает восстановление лишь внутри recovery window; решение само не меняет хранилище. */
export const decideRefresh = ({
  binding,
  now,
}: Readonly<{ binding: Binding; now: number }>): RefreshDecision => {
  if (binding.blocked || now >= binding.absoluteExpiresAt) return "blocked";
  if (binding.attempt) {
    if (
      now >= binding.attempt.recoverUntil ||
      binding.attempt.startedAt >= binding.expiresAt
    )
      return "blocked";
    return now >= binding.attempt.leaseUntil ? "takeover" : "wait";
  }
  return now >= binding.expiresAt ? "blocked" : "start";
};
