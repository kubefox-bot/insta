import { isolatedDockerPrefixes, storiesOnlyPrefixes } from "./conts";
import type { AcceptanceScope } from "./types";
export const selectScopePaths = ({
  paths,
  scope,
}: Readonly<{ paths: readonly string[]; scope: AcceptanceScope }>) => {
  const standardPaths = paths.filter(
    (path) => !isolatedDockerPrefixes.some((prefix) => path.startsWith(prefix)),
  );
  switch (scope) {
    case "core":
      return standardPaths.filter(
        (path) =>
          !storiesOnlyPrefixes.some((prefix) => path.startsWith(prefix)),
      );
    case "full":
      return standardPaths;
  }
};
