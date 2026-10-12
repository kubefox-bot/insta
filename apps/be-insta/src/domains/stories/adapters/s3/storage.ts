import type { StoryStorage } from "../../ports/storage/interfaces";
import { list } from "./list";
import { createStorageProfiles } from "./profiles";
import { put } from "./put";
import { read } from "./read";
import { remove } from "./remove";
import { sign } from "./sign";
import type { StorageProfile } from "./types";
/**
 * Создаёт S3-порты записи, чтения, удаления, inventory и playback через единый
 * проверяющий resolver профилей.
 */
export const createStoryStorage = ({
  profiles,
  clock,
}: Readonly<{
  profiles: readonly StorageProfile[];
  clock: () => number;
}>): StoryStorage => {
  const resolve = createStorageProfiles(profiles);
  return {
    putUnique: put(resolve),
    read: read(resolve),
    delete: remove(resolve),
    list: list(resolve),
    signPlayback: sign({ resolve, clock }),
  };
};
