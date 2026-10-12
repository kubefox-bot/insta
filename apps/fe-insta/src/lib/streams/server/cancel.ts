// Cleanup cannot replace a response failure or keep its caller pending. Native
// stream cancellation closes reads immediately; provider cleanup may never settle.
/**
 * Запрашивает отмену чтения без ожидания settlement, чтобы cleanup не блокировал ответ.
 * Отклонение cancel поглощается; вызов не доказывает завершение внешнего потока.
 */
export const requestStreamCancellation = (
  resource: Readonly<{ cancel: () => Promise<void> }>,
): void => {
  resource.cancel().catch(() => undefined);
};
