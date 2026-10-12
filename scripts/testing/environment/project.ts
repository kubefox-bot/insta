import {
  acceptanceRunSuffixPattern,
  approvedComposeProjects,
  ownedAcceptanceProjectPrefix,
} from "../conts";
import type { AcceptanceConfig } from "../types";
/** Разрешает стандартный проект либо явно выбранный run-owned проект только совпадающего scope до обращения к Docker. */
export const validateAcceptanceProject = ({
  project,
  scope,
}: Readonly<{ project: string; scope: AcceptanceConfig["scope"] }>) => {
  const prefix = `${ownedAcceptanceProjectPrefix + scope}-`;
  if (
    project === approvedComposeProjects[scope] ||
    (project.startsWith(prefix) &&
      acceptanceRunSuffixPattern.test(project.slice(prefix.length)))
  )
    return;
  throw new Error("Acceptance project does not match selected scope");
};
