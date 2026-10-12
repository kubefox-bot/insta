import { maintenancePolicy } from "../domain/maintenance/conts";
import type { StoryOwnership } from "../ports/maintenance/interfaces";
import type { StoryStorage } from "../ports/storage/interfaces";
import { reconcileObject } from "./reconcile/lib/object";
/**
 * Сверяет страницу storage с durable ownership ограниченными параллельными пачками.
 * Cursor продвигает только после settlement всей страницы без ошибок и отмены.
 */
export const reconcileObjects = async (
  input: Readonly<{ profile: string; prefix: string; signal?: AbortSignal }>,
  dependencies: Readonly<{
    ownership: StoryOwnership;
    storage: Pick<StoryStorage, "list" | "delete">;
  }>,
) => {
  if (input.signal?.aborted) return;
  const cursor = await dependencies.ownership.cursor(input.profile);
  const page = await dependencies.storage.list({
    profile: input.profile,
    prefix: input.prefix,
    limit: maintenancePolicy.reconcilePage,
    ...(cursor ? { cursor } : {}),
  });
  for (
    let offset = 0;
    offset < page.objects.length;
    offset += maintenancePolicy.concurrency
  ) {
    if (input.signal?.aborted) return;
    const results = await Promise.allSettled(
      page.objects
        .slice(offset, offset + maintenancePolicy.concurrency)
        .map((object) => reconcileObject({ ...input, object }, dependencies)),
    );
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }
  if (!input.signal?.aborted)
    await dependencies.ownership.advance({
      profile: input.profile,
      cursor: page.cursor ?? null,
    });
};
