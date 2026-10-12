import { createExpiry } from "./lib/expiry/create";
import { createRequestLifetime } from "./lib/request-lifetime/create";
import { prepareStory } from "./prefetch/prepare";
import type { PrefetchDependencies } from "./prefetch/types";
/** Владеет одной предзагрузкой Story, её запросом, сроком и освобождением медиаресурса. */
export const createStoryPrefetch = ({
  playback,
  clock,
  preloader,
}: PrefetchDependencies) => {
  const lifetime = createRequestLifetime();
  const expiry = createExpiry(clock);
  const owner = {
    storyId: "",
    /** Предоставляет пустую очистку до приобретения предзагруженного видео. */
    releaseMedia: () => {},
  };
  /** Отменяет запрос и срок предзагрузки, освобождает видео и забывает его Story. */
  const release = () => {
    lifetime.release();
    expiry.release();
    owner.releaseMedia();
    owner.releaseMedia = () => {};
    owner.storyId = "";
  };
  const dependencies = {
    playback,
    clock,
    preloader,
    owner,
    lifetime,
    expiry,
    release,
  };
  return {
    release,
    /** Подготавливает заданную Story через общий владелец запроса и медиаресурса. */
    prepare: (story: Parameters<typeof prepareStory>[0]["story"]) =>
      prepareStory({ story, dependencies }),
  };
};
