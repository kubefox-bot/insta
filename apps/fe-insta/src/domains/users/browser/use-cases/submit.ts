import { Result } from "@bloodyowl/boxed";
import { AuthBrowserIssueCode } from "../codes";
import type {
  SubmissionFailure,
  SubmissionOutcome,
  SubmissionPorts,
} from "./types";

/**
 * Запускает локальную фазу logout и превращает ошибку приватной очистки в Result, позволяя
 * продолжить серверный выход.
 */
const beginLogout = async (
  auth: SubmissionPorts<unknown>["auth"],
): Promise<Result<undefined, unknown>> => {
  try {
    await auth.beginLogout();
    return Result.Ok(undefined);
  } catch (cause) {
    return Result.Error(cause);
  }
};
/**
 * Сериализует отправку auth, применяет квитанцию и обновляет страницы; при исключении пытается
 * согласовать сессию повторно, не повторяя исходный POST.
 */
const submitRequest = async <Receipt>({
  ports,
  logout,
}: Readonly<{ ports: SubmissionPorts<Receipt>; logout: boolean }>) => {
  try {
    const result = await ports.auth.exclusive(ports.post);
    await ports.apply(result.receipt);
    if (result.successful) {
      ports.reset();
      if (logout && result.revocation)
        ports.auth.finishLogout(result.revocation);
      await ports.refresh();
    }
    return { state: "applied", revocation: result.revocation } as const;
  } catch {
    await ports.auth.exclusive(async () => ports.auth.reconcile());
    await ports.refresh();
    return { state: "reconciled" } as const;
  }
};
/**
 * Очищает прежнюю проблему, выполняет auth-отправку даже после ошибки logout-cleanup и
 * возвращает её вместе с исходом; всегда снимает pending в finally.
 */
export const submitAuthAction = async <Receipt>({
  logout,
  ports,
}: Readonly<{ logout: boolean; ports: SubmissionPorts<Receipt> }>): Promise<
  Result<SubmissionOutcome, SubmissionFailure>
> => {
  ports.auth.clearSubmissionIssue();
  try {
    const cleanup: Result<undefined, unknown> = logout
      ? await beginLogout(ports.auth)
      : Result.Ok(undefined);
    const outcome: SubmissionOutcome = await submitRequest({ ports, logout });
    if (cleanup.isError()) {
      ports.auth.reportPrivateCleanupFailure();
      return Result.Error({
        code: AuthBrowserIssueCode.PrivateCleanupFailed,
        cause: cleanup.getError(),
        outcome,
      });
    }
    return Result.Ok(outcome);
  } finally {
    ports.onPending(false);
  }
};
