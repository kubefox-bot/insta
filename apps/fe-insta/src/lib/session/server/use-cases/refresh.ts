import { Result } from "@bloodyowl/boxed";
import { SessionErrorCode } from "@insta/contracts/errors";
import { refreshPollBudgetMs, refreshPollIntervalMs } from "../conts";
import type { SessionDependencies } from "../ports/dependencies";
import type { Binding, SessionError } from "../types";
import { acquireRefresh } from "./lib/acquire-refresh";
import { completeRefresh } from "./lib/complete-refresh";
/** Ожидает чужую lease в пределах временного бюджета и конечного числа опросов либо завершает захваченную попытку. Возвращает готовую привязку, SESSION_REQUIRED, SESSION_BUSY либо SESSION_UNAVAILABLE при неопределённом исходе или неприемлемых credentials в completeRefresh; исключения портов оставляет вызывающему коду, собственного abort-контракта нет. */
export const refreshBinding = async (
  input: Readonly<{ bindingId: string; revision: number }>,
  dependencies: SessionDependencies,
): Promise<Result<Binding, SessionError>> => {
  const { clock, wait } = dependencies;
  const deadline = clock() + refreshPollBudgetMs;
  // Also bound a stalled or backwards clock; a losing process never waits indefinitely.
  for (
    let poll = 0;
    poll <= refreshPollBudgetMs / refreshPollIntervalMs;
    poll += 1
  ) {
    const acquisition = await acquireRefresh(input, dependencies);
    switch (acquisition.kind) {
      case "blocked":
        return Result.Error(SessionErrorCode.SessionRequired);
      case "ready":
        return Result.Ok(acquisition.binding);
      case "leased":
        return completeRefresh(acquisition.binding, dependencies);
      case "wait": {
        const remaining = deadline - clock();
        if (remaining <= 0) return Result.Error(SessionErrorCode.SessionBusy);
        await wait(Math.min(refreshPollIntervalMs, remaining));
      }
    }
  }
  return Result.Error(SessionErrorCode.SessionBusy);
};
