import { z } from "zod";
export const readStoryFixtureComposition = () => {
  const files = z.string().min(1).parse(Bun.env.COMPOSE_FILE).split(":");
  if (files.length < 3)
    throw new Error(
      "Stories browser requires private and exact runtime overlays",
    );
  return files.slice(1);
};
