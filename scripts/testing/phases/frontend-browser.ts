import { frontendBrowserFixtures } from "./conts";
import type { PhaseTarget } from "./types";

export const createFrontendBrowserTargets = async (): Promise<
  readonly PhaseTarget[]
> =>
  Promise.all(
    frontendBrowserFixtures.map(async ({ name, path, config }) => {
      const root = new URL("../../../", import.meta.url).pathname;
      if (!(await Bun.file(`${root}${path}`).exists()))
        throw new Error(
          `Frontend browser acceptance owner is missing: ${path}`,
        );
      return {
        name,
        paths: [path],
        commands: [
          [
            process.execPath,
            "node_modules/@playwright/test/cli.js",
            "test",
            "--config",
            config,
          ],
        ],
      };
    }),
  );
