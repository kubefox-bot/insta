import type { BrowserChannel, ChannelOptions } from "./types";

/**
 * Владеет BroadcastChannel и focus/message listeners до явного close. При ошибке
 * подключения освобождает уже созданные ресурсы; данные сообщений проверяет потребитель.
 */
export const openBrowserChannel = ({
  name,
  onMessage,
  onFocus,
}: ChannelOptions): BrowserChannel => {
  const channel = new BroadcastChannel(name);
  const state = { closed: false };
  /**
   * Передаёт входящее межвкладочное сообщение потребителю, пока канал открыт; поздние
   * события после close игнорирует.
   */
  const receive = (event: MessageEvent<unknown>) => {
    if (!state.closed) onMessage(event.data);
  };
  /**
   * Просит потребителя сверить состояние при возврате фокуса, если канал ещё принадлежит
   * активному владельцу.
   */
  const focus = () => {
    if (!state.closed) onFocus();
  };
  /**
   * Идемпотентно запрещает дальнейшие события и закрывает канал. Вложенные finally
   * обеспечивают попытку удаления обоих listeners и закрытия даже при ошибке cleanup.
   */
  const close = () => {
    if (state.closed) return;
    state.closed = true;
    try {
      channel.removeEventListener("message", receive);
    } finally {
      try {
        window.removeEventListener("focus", focus);
      } finally {
        channel.close();
      }
    }
  };
  try {
    channel.addEventListener("message", receive);
    window.addEventListener("focus", focus);
  } catch (error) {
    try {
      close();
    } catch (cleanupError) {
      throw Object.assign(
        new Error("Browser channel setup and cleanup failed", {
          cause: cleanupError,
        }),
        { setupError: error },
      );
    }
    throw error;
  }
  return {
    /**
     * Рассылает уведомление другим вкладкам только до закрытия канала; ошибка structured
     * clone/postMessage остаётся вызывающему коду.
     */
    publish: (notice) => {
      if (!state.closed) channel.postMessage(notice);
    },
    close,
  };
};
