import type { RedisClient } from "bun";
import { feedPolicy } from "../../../domains/stories/index";
import { createActorQuota } from "../../../lib/dragonfly/index";
import { sourceQuotaNamespaces } from "./conts";
/** Создаёт независимые квоты чтения ленты и playback, сохраняя их разные namespaces и policy-лимиты. */
export const createStoryQuotas = (
  input: Readonly<{ client: RedisClient; key: string }>,
) => ({
  feed: createActorQuota({
    ...input,
    namespace: sourceQuotaNamespaces.feed,
    maximum: feedPolicy.feedPerMinute,
  }),
  playback: createActorQuota({
    ...input,
    namespace: sourceQuotaNamespaces.playback,
    maximum: feedPolicy.playbackPerMinute,
  }),
});
