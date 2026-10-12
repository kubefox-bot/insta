import { testTimeoutMs } from "../conts";
import { browserTargetNames } from "./conts";
import type { PhaseTarget } from "./types";
export const createBrowserTargets = (
  paths: readonly string[],
): readonly PhaseTarget[] => {
  const browserPaths = paths.filter(
    (path) =>
      path.startsWith("__tests__/e2e/") &&
      path.endsWith(".spec.ts") &&
      !path.endsWith("main-telemetry.spec.ts"),
  );
  const runner = [
    process.execPath,
    "node_modules/@playwright/test/cli.js",
    "test",
    "--config",
    "__tests__/e2e/playwright.config.ts",
  ];
  const smokePaths = [
    "__tests__/e2e/auth/product.spec.ts",
    "__tests__/e2e/conversations/chat.spec.ts",
  ];
  return [
    ...Object.entries(browserTargetNames.primary).map(([channel, name]) => ({
      name,
      paths: browserPaths,
      commands: browserPaths.length
        ? browserPaths.map((path) => [...runner, `--project=${channel}`, path])
        : [],
    })),
    {
      name: browserTargetNames.smoke,
      paths: smokePaths,
      coverage: "filtered",
      commands: [
        [
          ...runner,
          ...smokePaths,
          "--grep",
          "real registration form|E05/E06/E09",
        ],
      ],
    },
    {
      name: browserTargetNames.protocol,
      paths: ["__tests__/integration/http3.host.test.ts"],
      commands: [
        [
          process.execPath,
          "test",
          "./__tests__/integration/http3.host.test.ts",
          "--timeout",
          String(testTimeoutMs),
        ],
      ],
    },
  ];
};
