import { Result } from "@bloodyowl/boxed";
import { StoryErrorCode } from "@insta/contracts/errors";
import type { PublishedStory, StoryError } from "../domain/types";
import type { StoryDependencies } from "../ports/persistence/interfaces";
import { publicationCapacity } from "./conts";
import { publishStory } from "./publish";
/**
 * Владеет множеством активных публикаций и общим сигналом остановки; зависимости
 * освобождает внешний lifecycle после close.
 */
export const createStoryPublisherLifetime = (
  dependencies: StoryDependencies,
) => {
  const stopping = new AbortController();
  const pending = new Set<Promise<Result<PublishedStory, StoryError>>>();
  return {
    /**
     * Отклоняет новые upload после остановки или при заполнении capacity, объединяет
     * сигналы отмены и удерживает задачу до её settlement.
     */
    publish: (
      input: Parameters<typeof publishStory>[0],
    ): ReturnType<typeof publishStory> => {
      if (stopping.signal.aborted)
        return Promise.resolve(Result.Error(StoryErrorCode.UploadCancelled));
      if (pending.size >= publicationCapacity.maxConcurrentUploads)
        return Promise.resolve(Result.Error(StoryErrorCode.Busy));
      const task = publishStory(
        {
          ...input,
          signal: input.signal
            ? AbortSignal.any([input.signal, stopping.signal])
            : stopping.signal,
        },
        dependencies,
      );
      pending.add(task);
      task.then(
        () => pending.delete(task),
        () => pending.delete(task),
      );
      return task;
    },
    /**
     * Прекращает admission, отменяет активные upload и ждёт settlement всех
     * зарегистрированных публикаций.
     */
    close: async () => {
      stopping.abort();
      await Promise.allSettled([...pending]);
    },
  };
};
