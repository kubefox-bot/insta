import { refreshLeaseMs, refreshRecoveryMs } from "../../conts";
import { decideRefresh } from "../../domain/refresh";
import type { SessionDependencies } from "../../ports/dependencies";
import type { Binding } from "../../types";

type Acquisition =
  | Readonly<{ kind: "ready" | "leased"; binding: Binding }>
  | Readonly<{ kind: "wait" | "blocked" }>;
/** Перечитывает привязку и принимает уже завершённую новую revision либо пытается атомарно захватить refresh. Просроченную привязку помечает через store; проигранный CAS возвращает wait, takeover сохраняет исходный ключ попытки через порт. */
export const acquireRefresh = async (
  { bindingId, revision }: Readonly<{ bindingId: string; revision: number }>,
  { store, clock, id }: SessionDependencies,
): Promise<Acquisition> => {
  const binding = await store.read(bindingId);
  if (!binding || binding.blocked) return { kind: "blocked" };
  const now = clock();
  if (
    !binding.attempt &&
    binding.revision > revision &&
    now < Math.min(binding.expiresAt, binding.absoluteExpiresAt)
  )
    return { kind: "ready", binding };
  const decision = decideRefresh({ binding, now });
  if (decision === "blocked") {
    await store.expire({ bindingId, revision: binding.revision, now });
    return { kind: "blocked" };
  }
  if (decision === "wait") return { kind: "wait" };
  const leased =
    decision === "takeover"
      ? await store.takeOver({ binding, leaseOwner: id(), now })
      : await store.beginRefresh({
          bindingId,
          revision: binding.revision,
          now,
          attempt: {
            credentials: binding.credentials,
            key: id(),
            revision: binding.revision,
            startedAt: now,
            recoverUntil: Math.min(
              now + refreshRecoveryMs,
              binding.absoluteExpiresAt,
            ),
            leaseOwner: id(),
            leaseGeneration: 1,
            leaseUntil: Math.min(
              now + refreshLeaseMs,
              binding.absoluteExpiresAt,
            ),
            state: "running",
          },
        });
  return leased ? { kind: "leased", binding: leased } : { kind: "wait" };
};
