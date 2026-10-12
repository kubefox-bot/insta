import { readBounded } from "../../lib/streams/read-bounded";
import { inspectionPolicy } from "./conts";
import type { DecoderProcess } from "./types";
/**
 * Параллельно ждёт выход процесса и ограниченно читает stdout/stderr. Принимает только
 * exit 0 без stderr и отмены; в finally убивает оставшийся процесс и ждёт exit.
 */
export const readDecoder = async ({
  child,
  signal,
}: Readonly<{ child: DecoderProcess; signal: AbortSignal }>) => {
  /** Посылает SIGKILL дочернему decoder; фактического выхода ожидает владелец readDecoder. */
  const stop = () => child.kill("SIGKILL");
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) stop();
  /**
   * Читает один поток decoder в пределах output budget; превышение или abort
   * останавливает процесс и возвращает null.
   */
  const readOutput = async (source: ReadableStream<Uint8Array>) => {
    const result = await readBounded({
      source,
      maxBytes: inspectionPolicy.maxProbeOutputBytes,
      signal,
    });
    if (result.isError()) {
      stop();
      return null;
    }
    return new TextDecoder().decode(result.get());
  };
  try {
    const [exit, stdout, stderr] = await Promise.all([
      child.exited,
      readOutput(child.stdout),
      readOutput(child.stderr),
    ]);
    return exit === 0 && stderr === "" && !signal.aborted ? stdout : null;
  } finally {
    signal.removeEventListener("abort", stop);
    if (child.exitCode === null) stop();
    await child.exited;
  }
};
