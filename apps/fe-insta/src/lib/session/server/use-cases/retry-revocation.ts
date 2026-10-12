import { revocationBackoffMs, revocationWaveDelayMs } from "../conts";
import type { RevocationDependencies } from "../ports/dependencies";
import type { Binding } from "../types";
/** Повторяет revoke с сохранённым idempotency key и расшифрованным секретом, затем сохраняет подтверждение или следующую волну backoff. Ошибка backend считается pending; ошибка записи результата пробрасывается, чтобы неизвестный исход не выглядел подтверждённым. */
export const retryRevocation = async (
  binding: Binding,
  { store, backend, crypto, clock }: RevocationDependencies,
): Promise<"confirmed" | "pending"> => {
  const pending = binding.revocation;
  if (!pending) return "confirmed";
  const confirmed = await Promise.resolve()
    .then(async () => {
      const result = await backend.revoke({
        backendSessionId: binding.backendSessionId,
        revokeSecret: await crypto.openRevokeSecret(binding.revokeSecret),
        key: pending.key,
      });
      return result.isOk();
    })
    .catch(() => false);
  const waveIndex = pending.failures % (revocationBackoffMs.length + 1);
  const delay = revocationBackoffMs[waveIndex] ?? revocationWaveDelayMs;
  await store.finishRevocation({
    bindingId: binding.bindingId,
    key: pending.key,
    failures: pending.failures,
    nextAttemptAt: confirmed
      ? Math.max(clock(), binding.absoluteExpiresAt)
      : clock() + delay,
    confirmed,
  });
  return confirmed ? "confirmed" : "pending";
};
/** Читает доступную пачку revocation и обрабатывает её последовательно. Abort проверяется перед следующей записью: уже начатый revoke и сохранение его результата дожидаются завершения; ошибки чтения и записи не подавляются. */
export const retryPendingRevocations = async (
  dependencies: RevocationDependencies,
  signal?: AbortSignal,
) => {
  const pending = await dependencies.store.pendingRevocations(
    dependencies.clock(),
  );
  for (const binding of pending) {
    if (signal?.aborted) return;
    await retryRevocation(binding, dependencies);
  }
};
