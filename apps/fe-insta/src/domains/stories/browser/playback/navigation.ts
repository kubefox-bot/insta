import { get } from "svelte/store";
import { storyNavigationOffsets } from "./conts";
import { selectStory } from "./select";
import type { SelectionDependencies } from "./types";
/** Вычисляет соседний либо текущий индекс и передаёт выбор проверке срока; закрытый просмотр и переход перед началом игнорирует. */
export const navigateStory = async ({
  direction,
  dependencies,
}: Readonly<{
  direction: keyof typeof storyNavigationOffsets;
  dependencies: SelectionDependencies;
}>) => {
  const current = get(dependencies.state);
  if (current.kind === "closed") return;
  const index = current.index + storyNavigationOffsets[direction];
  if (index < 0) return;
  await selectStory({ group: current.group, index, dependencies });
};
