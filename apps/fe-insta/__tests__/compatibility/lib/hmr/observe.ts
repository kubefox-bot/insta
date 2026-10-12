import type { ObservationOptions } from "./types";

export const observeCssHmr = async (options: ObservationOptions) => {
  const { socket } = options;
  const completion = Promise.withResolvers<string>();
  let active = true;
  let setupCompleted = false;
  let update: string | null = null;
  const complete = () => {
    if (active && setupCompleted && update !== null) completion.resolve(update);
  };
  const change = async () => {
    if (!active) return;
    await options.change();
    setupCompleted = true;
    complete();
  };
  const opened = () => {
    // Own setup rejection immediately and propagate it to the awaited outcome.
    change().catch(completion.reject);
  };
  const failed = () => completion.reject(new Error("HMR socket failed"));
  const closed = () =>
    completion.reject(new Error("HMR socket closed before update"));
  const received = (event: Event) => {
    if (!(event instanceof MessageEvent)) return;
    try {
      const data: unknown = JSON.parse(String(event.data));
      if (
        typeof data === "object" &&
        data !== null &&
        "type" in data &&
        data.type === "update"
      ) {
        update = String(event.data);
        complete();
      }
    } catch (error) {
      completion.reject(error);
    }
  };
  const timeout = setTimeout(
    () => completion.reject(new Error("HMR open/update deadline exceeded")),
    options.timeoutMs,
  );
  try {
    socket.addEventListener("open", opened, { once: true });
    socket.addEventListener("error", failed);
    socket.addEventListener("close", closed);
    socket.addEventListener("message", received);
    return await completion.promise;
  } finally {
    active = false;
    clearTimeout(timeout);
    socket.removeEventListener("open", opened);
    socket.removeEventListener("error", failed);
    socket.removeEventListener("close", closed);
    socket.removeEventListener("message", received);
    socket.close();
  }
};
