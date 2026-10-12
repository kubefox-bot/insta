import { releaseLease } from "./lease";
import { trimExpiredPrefix } from "./retention-prefix";
import type { RetentionInput, StreamsDependencies } from "./types";
/** Ждёт actual cleanup собственной аренды на успехе, ошибке и отмене, сохраняя обе возможные ошибки. */
export const retainStream = async (
  input: RetentionInput,
  dependencies: StreamsDependencies,
) => {
  const outcome = await trimExpiredPrefix(input, dependencies).then(
    () => ({ ok: true as const }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  const released = await releaseLease(
    { lease: input.lease },
    dependencies,
  ).then(
    () => ({ ok: true as const }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  if (!outcome.ok && !released.ok)
    throw new AggregateError(
      [outcome.error, released.error],
      "Retention and lease release failed",
      { cause: outcome.error },
    );
  if (!outcome.ok) throw outcome.error;
  if (!released.ok) throw released.error;
};
