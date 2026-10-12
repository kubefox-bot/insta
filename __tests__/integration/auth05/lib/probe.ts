import { Result } from "@bloodyowl/boxed";

export const withOwnedProbe = async <T extends { close(): Promise<void> }, R>({
  acquire,
  run,
}: {
  readonly acquire: () => Promise<T>;
  readonly run: (probe: T) => Promise<R>;
}): Promise<R> => {
  const probe = await acquire();
  const outcome = await Result.fromPromise(run(probe));
  const cleanup = await Result.fromPromise(probe.close());
  if (outcome.isError()) {
    if (cleanup.isError())
      throw new AggregateError(
        [outcome.getError(), cleanup.getError()],
        "Probe operation and cleanup failed",
        { cause: outcome.getError() },
      );
    throw outcome.getError();
  }
  if (cleanup.isError()) throw cleanup.getError();
  return outcome.get();
};
