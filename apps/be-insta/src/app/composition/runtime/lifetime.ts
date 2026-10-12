/** Создаёт single-flight teardown: повторный close ждёт тот же settlement, включая ошибочный исход cleanup. */
export const runtimeClose = (
  resources: Pick<AsyncDisposableStack, "disposeAsync">,
) => {
  let closing: Promise<void> | undefined;
  return () => {
    closing ??= resources.disposeAsync();
    return closing;
  };
};
