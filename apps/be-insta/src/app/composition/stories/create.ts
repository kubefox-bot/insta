import {
  createMediaInspector,
  createStoryStorage,
} from "../../../domains/stories/server/index";
import type { StoriesConfiguration } from "./types";
/** Создаёт media inspector и S3 storage только при enabled Stories; владелец обязан закрыть media runtime. */
export const createStoriesInfrastructure = ({
  config,
  clock,
}: Readonly<{
  config: StoriesConfiguration;
  clock: () => number;
}>) => {
  if (config.mode === "disabled") return null;
  const media = createMediaInspector();
  return {
    mediaInspector: media,
    close: media.close,
    storage: createStoryStorage({ profiles: config.profiles, clock }),
    activeProfile: config.activeProfile,
    retainedProfiles: config.profiles.map((profile) => profile.id),
  };
};
