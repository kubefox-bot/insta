import type { coreParts, deferredParts } from "./conts";
export type Scope = "core" | "full";
export type ScenarioPart =
  | (typeof coreParts)[number]
  | (typeof deferredParts)[number];
export type ScenarioOwner = Readonly<{
  key: ScenarioPart;
  paths: readonly string[];
  expected: string;
  faultPoint: string;
}>;
