import { z } from "zod";
import { faroProtocol, intakePolicy } from "../client/conts";
import { faroBatchSchema } from "../client/schema";
import type { IntakeOutcome } from "../client/types";
import { createIntakeAdmission, currentAll } from "./intake";
import { publishFaro } from "./publish-faro";
import type {
  PayloadIntakeInput,
  PayloadIntakeOutcome,
  StandaloneIntakeInput,
} from "./types";

const probeSchema = z.strictObject({ protocol: z.literal(faroProtocol) });
/**
 * Проверяет receiver запросом OPTIONS с deadline и ожидаемым protocol в JSON.
 * Отсутствующий адрес, HTTP отказ, неверный ответ и сетевой сбой дают false без
 * загрузки браузерного SDK.
 */
export const probeFaroReceiver = async (receiver: string | undefined) => {
  if (!receiver) return false;
  try {
    const response = await fetch(receiver, {
      method: "OPTIONS",
      signal: AbortSignal.timeout(intakePolicy.requestTimeoutMs),
    });
    return (
      response.ok &&
      probeSchema.safeParse(await response.json(), { jitless: true }).success
    );
  } catch {
    return false;
  }
};
// Owner-internal payload stage, never a browser or application public API.
/**
 * Создаёт внутренний Faro intake с проверкой схемы и актуального consent. Без receiver
 * возвращает unavailable; повтор уже claimed id считается accepted. Новый claim
 * создаётся до publish и не снимается при неудачной доставке.
 */
export const createFaroPayloadIntake = ({
  receiver,
  duplicate,
}: Readonly<{
  receiver: string | undefined;
  duplicate: (id: string) => boolean;
}>) => {
  return async ({
    payload,
    preference,
  }: PayloadIntakeInput): Promise<PayloadIntakeOutcome> => {
    const parsed = faroBatchSchema.safeParse(payload, { jitless: true });
    if (!parsed.success) return "invalid";
    if (!currentAll({ preference, ...parsed.data })) return "denied";
    if (!receiver) return "unavailable";
    if (duplicate(parsed.data.analyticsEventId)) return "accepted";
    return publishFaro({ receiver, body: parsed.data.body });
  };
};

/**
 * Создаёт standalone Faro intake с общим или собственным admission; возвращённый
 * обработчик проверяет бюджет источника до payload, consent и доставки receiver.
 */
export const createFaroIntake = ({
  receiver,
  clock,
  admission = createIntakeAdmission(clock),
}: Readonly<{
  receiver: string | undefined;
  clock: () => number;
  admission?: ReturnType<typeof createIntakeAdmission>;
}>) => {
  const accept = createFaroPayloadIntake({
    receiver,
    duplicate: admission.duplicate,
  });
  return async ({
    source,
    ...input
  }: StandaloneIntakeInput): Promise<IntakeOutcome> => {
    if (!admission.admit(source)) return "rate_limited";
    return accept(input);
  };
};
