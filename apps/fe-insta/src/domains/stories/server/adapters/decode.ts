import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode } from "@insta/contracts/errors";
import {
  publishStory200Schema,
  publishStory400Schema,
} from "../../../../lib/api/generated/schemas/publishStorySchema";
import { readStoryPublication200Schema } from "../../../../lib/api/generated/schemas/readStoryPublicationSchema";
import { storyFeed200Schema } from "../../../../lib/api/generated/schemas/storyFeedSchema";
import { storyPlayback200Schema } from "../../../../lib/api/generated/schemas/storyPlaybackSchema";
import { storyTransport } from "../conts";
import type { StoryBackend } from "../ports/backend";
/** Проверяет ответ Nest схемой выбранной операции. Некорректный успех становится неизвестным исходом; ошибки сохраняют HTTP-статус, Retry-After и допустимые meta. */
export const decodeStoryReply = ({
  response,
  raw,
  operation,
}: Readonly<{
  response: Response;
  raw: unknown;
  operation: Parameters<StoryBackend>[0]["operation"];
}>): Awaited<ReturnType<StoryBackend>> => {
  if (!response.ok) {
    const parsed = publishStory400Schema.safeParse(raw);
    return Result.Error({
      code: parsed.success
        ? parsed.data.error.code
        : CommonErrorCode.OperationOutcomeUnknown,
      status: response.status,
      ...(response.headers.get("Retry-After")
        ? { retryAfter: response.headers.get("Retry-After") ?? undefined }
        : {}),
      ...(parsed.success ? { meta: parsed.data.meta } : {}),
    });
  }
  const schemas = {
    feed: storyFeed200Schema,
    publish: publishStory200Schema,
    publication: readStoryPublication200Schema,
    playback: storyPlayback200Schema,
  } as const;
  const parsed = schemas[operation].safeParse(raw);
  if (!parsed.success)
    return Result.Error({
      code: CommonErrorCode.OperationOutcomeUnknown,
      status: storyTransport.unavailable,
    });
  return Result.Ok(
    Response.json(parsed.data, { headers: { "Cache-Control": "no-store" } }),
  );
};
