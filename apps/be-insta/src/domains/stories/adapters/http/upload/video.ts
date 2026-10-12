import type { Readable } from "node:stream";
/**
 * Адаптирует Node video stream в Web Stream с чтением по спросу; отмена потребителя
 * разрушает исходный поток.
 */
export const videoStream = (stream: Readable) => {
  const iterator = stream[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    /**
     * Читает очередной chunk из async iterator, допускает только байты и закрывает Web
     * Stream при конце источника.
     */
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) {
        controller.close();
        return;
      }
      const value: unknown = next.value;
      if (!(value instanceof Uint8Array))
        throw new Error("Invalid video chunk");
      controller.enqueue(value);
    },
    /** Разрушает исходный Node stream после отказа потребителя от дальнейшего чтения. */
    cancel() {
      stream.destroy();
    },
  });
};
