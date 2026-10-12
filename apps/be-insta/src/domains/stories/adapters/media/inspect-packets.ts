import { Worker } from "node:worker_threads";
import { Result } from "@bloodyowl/boxed";
import { StoryErrorCode } from "@insta/contracts/errors";
import { storyWireLimits } from "@insta/contracts/stories";
import { z } from "zod";
import type { MediaError } from "../../ports/media-inspector/interfaces";
import type { PacketInspection } from "./types";
import { webmReply } from "./webm/reply";

const reply = z.union([
  z.object({
    error: z.enum([
      StoryErrorCode.UnsupportedMedia,
      StoryErrorCode.MalformedMedia,
      StoryErrorCode.TooLong,
      StoryErrorCode.DurationUnprovable,
    ]),
  }),
  z.object({
    value: z.union([
      webmReply,
      z.object({
        container: z.literal("mp4"),
        videoCodec: z.literal("h264"),
        audioCodec: z.literal("aac"),
        durationMs: z
          .number()
          .positive()
          .finite()
          .max(storyWireLimits.maxDurationMs),
      }),
    ]),
  }),
]);
/**
 * Выносит packet inspection в отдельный worker и валидирует его ответ для MP4/WebM;
 * результат отдаёт только после завершения worker.
 */
export const inspectPackets = ({
  bytes,
  signal,
  maxDurationMs,
  createWorker = () =>
    new Worker(new URL(import.meta.resolve("#stories-media-worker"))),
}: Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  signal: AbortSignal;
  maxDurationMs: number;
  createWorker?: () => Worker;
}>) =>
  new Promise<Result<PacketInspection, MediaError>>((resolve) => {
    const worker = createWorker();
    let settled = false;
    /**
     * Однократно фиксирует исход, снимает abort-listener и ждёт terminate; ошибка
     * остановки worker заменяет исход на InspectorUnavailable.
     */
    const finish = (result: Result<PacketInspection, MediaError>) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      worker.terminate().then(
        () => resolve(result),
        () => resolve(Result.Error(StoryErrorCode.InspectorUnavailable)),
      );
    };
    /** Завершает packet inspection с Deadline через общий путь остановки worker. */
    const abort = () => finish(Result.Error(StoryErrorCode.Deadline));
    signal.addEventListener("abort", abort, { once: true });
    worker.on("message", (message: unknown) => {
      const parsed = reply.safeParse(message);
      if (!parsed.success) {
        finish(Result.Error(StoryErrorCode.MalformedMedia));
        return;
      }
      finish(
        "error" in parsed.data
          ? Result.Error(parsed.data.error)
          : Result.Ok(parsed.data.value),
      );
    });
    worker.once("error", () =>
      finish(Result.Error(StoryErrorCode.MalformedMedia)),
    );
    worker.once("exit", () =>
      finish(Result.Error(StoryErrorCode.MalformedMedia)),
    );
    if (signal.aborted) abort();
    else worker.postMessage({ bytes, maxDurationMs });
  });
