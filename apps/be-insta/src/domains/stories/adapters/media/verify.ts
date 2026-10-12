import { Result } from "@bloodyowl/boxed";
import { StoryErrorCode } from "@insta/contracts/errors";
import type {
  MediaError,
  VerifiedMedia,
} from "../../ports/media-inspector/interfaces";
import { verifyDecoding } from "./decode";
import type { PacketInspection } from "./types";
import { verifyWebmDecoding } from "./webm/decode";
/**
 * Подтверждает packet inventory реальным декодированием соответствующего контейнера. Для
 * WebM удаляет внутренний inventory из публичного результата; abort имеет приоритет над
 * malformed.
 */
export const verifyInspected = async ({
  bytes,
  signal,
  inspected,
}: Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  signal: AbortSignal;
  inspected: PacketInspection;
}>): Promise<Result<VerifiedMedia, MediaError>> => {
  const valid =
    inspected.container === "webm"
      ? await verifyWebmDecoding({ bytes, signal, inventory: inspected.webm })
      : await verifyDecoding({ bytes, signal });
  if (signal.aborted) return Result.Error(StoryErrorCode.Deadline);
  if (!valid) return Result.Error(StoryErrorCode.MalformedMedia);
  if (inspected.container === "mp4") return Result.Ok(inspected);
  const { webm: _inventory, ...verified } = inspected;
  return Result.Ok(verified);
};
