import { maintenancePolicy } from "../domain/maintenance/conts";
import type { StoryCleanup } from "../ports/maintenance/interfaces";
import type { StoryStorage } from "../ports/storage/interfaces";
/**
 * Захватывает ограниченную пачку учтённых объектов, удаляет storage и лишь затем
 * подтверждает cleanup. Ошибки переводит в retry; abort прекращает новые удаления,
 * сохраняя оставшиеся claims.
 */
export const cleanupExpired = async (
  input: Readonly<{ now: number; signal?: AbortSignal }>,
  dependencies: Readonly<{
    cleanup: StoryCleanup;
    storage: Pick<StoryStorage, "delete">;
  }>,
) => {
  if (input.signal?.aborted) return { removed: 0, failed: 0 };
  const accounts = await dependencies.cleanup.claim({
    now: input.now,
    limit: maintenancePolicy.cleanupBatch,
    signal: input.signal,
  });
  let removed = 0;
  let failed = 0;
  for (const account of accounts) {
    if (input.signal?.aborted) break;
    try {
      await dependencies.storage.delete({
        profile: account.profile,
        key: account.key,
      });
      await dependencies.cleanup.acknowledge(account);
      removed++;
    } catch {
      failed++;
      await dependencies.cleanup.retry({ ...account, now: input.now });
    }
  }
  return { removed, failed };
};
