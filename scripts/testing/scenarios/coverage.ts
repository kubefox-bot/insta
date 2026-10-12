import { coreParts, deferredParts } from "./conts";
import type { ScenarioOwner, ScenarioPart, Scope } from "./types";
export const requiredScenarioParts = (scope: Scope): readonly ScenarioPart[] =>
  scope === "core" ? coreParts : [...coreParts, ...deferredParts];
export const verifyCoverage = ({
  scope,
  owners,
}: {
  readonly scope: Scope;
  readonly owners: readonly ScenarioOwner[];
}) => {
  const required = requiredScenarioParts(scope);
  const coveredScenarioParts = owners
    .filter((owner) => owner.paths.length > 0 && required.includes(owner.key))
    .map((owner) => owner.key);
  const errors: string[] = [];
  for (const key of required) {
    const matches = owners.filter((owner) => owner.key === key);
    if (!matches.length) errors.push(`Missing required owner: ${key}`);
    if (matches.length > 1) errors.push(`Duplicate primary owner: ${key}`);
  }
  for (const owner of owners)
    if (!owner.paths.length) errors.push(`Empty owner selector: ${owner.key}`);
  return { coveredScenarioParts, errors };
};
