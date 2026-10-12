import { Result } from "@bloodyowl/boxed";
/**
 * Связывает abort с reader.cancel и возвращает освобождение listener с ожиданием
 * cancellation settlement; lock reader остаётся у вызывающего.
 */
export const bindCancellation = ({
  reader,
  signal,
}: Readonly<{
  reader: ReadableStreamDefaultReader<Uint8Array>;
  signal: AbortSignal;
}>) => {
  let settlement: Promise<Result<void, unknown>> | undefined;
  /**
   * Запрашивает отмену reader и сохраняет её исход для обязательного ожидания при
   * cleanup.
   */
  const abort = () => {
    settlement = reader.cancel().then(
      () => Result.Ok(undefined),
      (error) => Result.Error(error),
    );
  };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  return async () => {
    signal.removeEventListener("abort", abort);
    const result = await settlement;
    if (result?.isError()) throw result.getError();
  };
};
