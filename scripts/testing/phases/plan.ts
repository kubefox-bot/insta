import { createBrowserTargets } from "./browser";
import { createFrontendBrowserTargets } from "./frontend-browser";
import { createProviderTargets } from "./providers";
import { selectScopePaths } from "./scope";
import { createSourceTargets } from "./source";
import type { AcceptanceScope, PhaseTarget } from "./types";
export const createPhaseTargets = async ({
  dockerPrefix,
  scope,
  includeSourceChecks = true,
}: {
  readonly scope: AcceptanceScope;
  readonly dockerPrefix: readonly string[];
  readonly includeSourceChecks?: boolean;
}): Promise<readonly PhaseTarget[]> => {
  const root = new URL("../../../", import.meta.url).pathname;
  const discovered = await Array.fromAsync(
    new Bun.Glob("__tests__/{integration,abuse,e2e}/**/*.{test,spec}.ts").scan({
      cwd: root,
    }),
  );
  const paths = selectScopePaths({ paths: discovered, scope });
  return [
    ...(includeSourceChecks ? createSourceTargets() : []),
    ...createProviderTargets({ phase: "integration", paths, dockerPrefix }),
    ...createProviderTargets({ phase: "abuse", paths, dockerPrefix }),
    ...createBrowserTargets(paths),
    ...(await createFrontendBrowserTargets()),
  ];
};
