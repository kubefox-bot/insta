import type { DeliveryAck } from "@insta/contracts/realtime";
import { retryJitterDivisor, retryMaximumExponent } from "./conts";
import type { DeliveryStep, RetryPolicy, TransitionInput } from "./types";

/** Сверяет координаты только реально отправленной единицы; чужой ACK не меняет подписку. */
export const matchesDelivery = (expected: DeliveryAck, actual: DeliveryAck) =>
  expected.subscriptionId === actual.subscriptionId &&
  expected.streamId === actual.streamId &&
  expected.epoch === actual.epoch &&
  expected.cursor === actual.cursor;

/** Вычисляет equal jitter с ограниченным exponent; серверный cap не ограничивает Retry-After. */
export const deliveryRetryDelay = ({
  retries,
  random,
  policy,
}: Readonly<{
  retries: number;
  random: number;
  policy: Pick<RetryPolicy, "deliveryRetryBaseMs" | "deliveryRetryCapMs">;
}>) => {
  const capped = Math.min(
    policy.deliveryRetryCapMs,
    policy.deliveryRetryBaseMs * 2 ** Math.min(retries, retryMaximumExponent),
  );
  return Math.ceil((capped / retryJitterDivisor) * (1 + random));
};

/** Только точный applied продвигает cursor; timeout/отказ транспорта не расходуют бюджет handler failures. */
export const transitionDelivery = (input: TransitionInput): DeliveryStep => {
  const { reply, expected, nowMs, expiresAt } = input;
  if (reply.kind === "closed") return { kind: "closed" };
  if (nowMs >= expiresAt) return { kind: "resync-required" };
  const valid =
    "position" in reply && matchesDelivery(expected, reply.position);
  if (valid && reply.kind === "applied")
    return { kind: "acked", failures: 0, retries: 0 };
  const failures =
    input.failures + (valid && reply.kind === "apply-failed" ? 1 : 0);
  if (failures >= input.policy.maxApplyFailures)
    return { kind: "blocked", failures };
  const retryAfterMs = valid ? retryHint(reply) : 0;
  return {
    kind: "retry",
    failures,
    retries: input.retries + 1,
    delayMs: Math.min(
      expiresAt - nowMs,
      Math.max(retryAfterMs, deliveryRetryDelay(input)),
    ),
  };
};

/** Необязательный серверный hint принадлежит только retry-later. */
const retryHint = (reply: TransitionInput["reply"]) =>
  reply.kind === "retry-later" ? (reply.retryAfterMs ?? 0) : 0;
