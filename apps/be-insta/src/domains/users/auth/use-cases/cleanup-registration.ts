import type { RegistrationPersistence } from "../ports/registration/persistence";
/**
 * Последовательно очищает выбранную пачку истёкших регистраций с актуальными часами для
 * каждой; ошибка прерывает проход и пробрасывается worker.
 */
export const cleanupRegistration = async ({
  persistence,
  clock,
}: Readonly<{ persistence: RegistrationPersistence; clock: () => number }>) => {
  const expired = await persistence.expired(clock());
  for (const userId of expired)
    await persistence.cleanup({ userId, now: clock() });
};
