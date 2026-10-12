import { Result } from "@bloodyowl/boxed";
import { StoryErrorCode } from "@insta/contracts/errors";
import { readBounded } from "../../lib/streams/read-bounded";
import type {
  MediaError,
  MediaInspector,
  VerifiedMedia,
} from "../../ports/media-inspector/interfaces";
import { inspectPackets } from "./inspect-packets";
import { verifyInspected } from "./verify";
/**
 * Ограниченно читает media, проверяет пакеты в worker и подтверждает декодирование.
 * Отмену трактует как Deadline, превышение байтов — отдельно от недоступности инспектора.
 */
export const inspectSource = async ({
  input,
  signal,
}: Readonly<{
  input: Parameters<MediaInspector["inspect"]>[0];
  signal: AbortSignal;
}>): Promise<Result<VerifiedMedia, MediaError>> => {
  try {
    const bounded = await readBounded({ ...input, signal });
    if (bounded.isError())
      return Result.Error(
        bounded.getError() === "ABORTED"
          ? StoryErrorCode.Deadline
          : StoryErrorCode.FileTooLarge,
      );
    const bytes = bounded.get();
    const packets = await inspectPackets({
      bytes,
      signal,
      maxDurationMs: input.maxDurationMs,
    });
    if (packets.isError()) return packets;
    return await verifyInspected({ bytes, signal, inspected: packets.get() });
  } catch {
    return Result.Error(
      signal.aborted
        ? StoryErrorCode.Deadline
        : StoryErrorCode.InspectorUnavailable,
    );
  }
};
