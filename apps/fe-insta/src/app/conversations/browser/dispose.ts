/**
 * Создаёт teardown runtime: инвалидирует continuation, снимает подписки, останавливает
 * список/очередь/receipts и очищает store; завершение connection асинхронное, его ошибку
 * сообщает cleanupFailed.
 */
export const createRuntimeDisposal =
  ({
    continuation,
    unsubscribe,
    list,
    releasePrivate,
    queue,
    receipts,
    store,
    connection,
    cleanupFailed,
  }: Readonly<{
    continuation: Readonly<{ dispose: () => void }>;
    unsubscribe: () => void;
    list: Readonly<{ dispose: () => void }>;
    releasePrivate: () => void;
    queue: Readonly<{ dispose: () => void }>;
    receipts: Readonly<{ dispose: () => void }>;
    store: Readonly<{ clear: () => void }>;
    connection: Readonly<{ dispose: () => Promise<void> }>;
    cleanupFailed: () => void;
  }>) =>
  () => {
    continuation.dispose();
    unsubscribe();
    list.dispose();
    releasePrivate();
    queue.dispose();
    receipts.dispose();
    store.clear();
    connection.dispose().catch(cleanupFailed);
  };
