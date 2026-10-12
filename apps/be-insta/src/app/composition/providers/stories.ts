import {
  storiesDependenciesToken,
  storyReadsToken,
} from "../../../domains/stories/http/server";
import type { RuntimeDependencies } from "../runtime/index";
/** Регистрирует только publication и read порты Stories; disabled-режим получает null providers. */
export const storyProviders = (stories: RuntimeDependencies["stories"]) => [
  { provide: storiesDependenciesToken, useValue: stories?.publication ?? null },
  { provide: storyReadsToken, useValue: stories?.reads ?? null },
];
