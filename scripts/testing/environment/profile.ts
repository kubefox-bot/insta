import { composeFields } from "../conts";

/** Формирует prepared overlay для дочерних fixture-команд. */
export const createPreparedProfile = (
  images: Readonly<Record<"frontend" | "backend" | "testhost", string>>,
) => ({
  services: {
    "fe-insta": { image: images.frontend, build: null },
    "be-insta": { image: images.backend, build: null },
    testhost: {
      image: images.testhost,
      build: null,
      user: "bun",
      [composeFields.workingDirectory]: "/workspace",
      volumes: [],
    },
  },
});
