import type { LaunchOptions } from "@playwright/test";
import { syntheticMediaArguments } from "./conts";

/** Дополняет исходный worker launch, сохраняя выбранный executable и proxy arguments; применяется только к synthetic media tests. */
export const launchWithSyntheticMedia = async (
  { launchOptions }: Readonly<{ launchOptions: LaunchOptions }>,
  use: (options: LaunchOptions) => Promise<void>,
) =>
  use({
    ...launchOptions,
    args: [...(launchOptions.args ?? []), ...syntheticMediaArguments],
  });
