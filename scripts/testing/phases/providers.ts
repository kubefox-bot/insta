import { testTimeoutMs } from "../conts";
import { createHostProviderCommands } from "./host-commands";
import type { PhaseTarget } from "./types";
export const createProviderTargets = ({
  phase,
  paths,
  dockerPrefix,
}: {
  readonly phase: "integration" | "abuse";
  readonly paths: readonly string[];
  readonly dockerPrefix: readonly string[];
}): readonly PhaseTarget[] => {
  const selected = paths.filter(
    (path) =>
      path.startsWith(`__tests__/${phase}/`) &&
      path.endsWith(".test.ts") &&
      !path.endsWith("http3.host.test.ts"),
  );
  const hostOwned = (path: string) =>
    path.endsWith(".host.test.ts") ||
    path === "__tests__/abuse/recovery/support-restart.test.ts";
  const container = selected.filter((path) => !hostOwned(path));
  const host = selected.filter(hostOwned);
  return [
    {
      name: `${phase}-providers`,
      paths: container,
      commands: container.length
        ? [
            [
              ...dockerPrefix,
              "run",
              "--pull",
              "never",
              "--rm",
              "--no-deps",
              "--user",
              "bun",
              "testhost",
              "bun",
              "test",
              ...container.map((path) => `./${path}`),
              "--timeout",
              String(testTimeoutMs),
            ],
          ]
        : [],
    },
    {
      name: `${phase}-host`,
      paths: host,
      commands: createHostProviderCommands(host),
    },
  ];
};
