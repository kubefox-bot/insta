import type { AuthSynchronization } from "./types";
/**
 * Создаёт сериализованное auth-действие: инвалидирует прежние чтения, выполняет операцию и в
 * finally перечитывает identity и уведомляет вкладки; отказ reconcile прерывает публикацию.
 */
export const createAuthExclusive =
  ({
    owner,
    synchronization,
    reconcile,
  }: Readonly<{
    owner: { epoch: number };
    synchronization: AuthSynchronization;
    reconcile: () => Promise<void>;
  }>) =>
  async <Value>(execute: () => Promise<Value>) =>
    synchronization.exclusive(async () => {
      owner.epoch += 1;
      try {
        return await execute();
      } finally {
        await reconcile();
        synchronization.publish();
      }
    });
