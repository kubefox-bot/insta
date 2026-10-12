import type { PublicPreference } from "@insta/contracts/privacy";
import { consentPolicyVersion } from "@insta/contracts/privacy";
import { intakePolicy } from "../client/conts";
import { clientBatchSchema } from "../client/schema";
import type { IntakeOutcome } from "../client/types";
import { createClientClaims } from "./claims";
import { emitAcceptedClientEvents } from "./emit-client";
import type {
  PayloadIntakeInput,
  PayloadIntakeOutcome,
  StandaloneIntakeInput,
} from "./types";
/**
 * Создаёт локальные для экземпляра лимиты источников и дедупликацию событий с
 * внедрёнными часами. Состояние не хранится между процессами; повторное использование
 * admission объединяет бюджет intake.
 */
export const createIntakeAdmission = (clock: () => number) => {
  const sources = new Map<string, { window: number; count: number }>();
  return {
    /**
     * Удаляет истёкшие окна, учитывает очередной запрос источника и проверяет его бюджет.
     * При заполненной карте отклоняет новый источник; даже отклонённый запрос существующего
     * источника увеличивает счётчик.
     */
    admit: (source: string) => {
      const now = clock();
      for (const [key, value] of sources)
        if (value.window + intakePolicy.rateWindowMs <= now)
          sources.delete(key);
      const current = sources.get(source);
      if (current) {
        current.count += 1;
        return current.count <= intakePolicy.requestsPerMinute;
      }
      if (sources.size >= intakePolicy.maximumSources) return false;
      sources.set(source, { window: now, count: 1 });
      return true;
    },
    duplicate: createClientClaims(clock),
  };
};
/**
 * Разрешает optional telemetry только для текущего all с положительной revision и
 * совпавшими версиями preference и payload; устаревший снимок не принимается.
 */
export const currentAll = ({
  preference,
  revision,
  policyVersion,
}: Readonly<{
  preference: PublicPreference;
  revision: number;
  policyVersion: number;
}>) =>
  preference.choice === "all" &&
  preference.revision > 0 &&
  preference.revision === revision &&
  preference.policyVersion === consentPolicyVersion &&
  policyVersion === preference.policyVersion;
// Owner-internal payload stage; only the HTTP owner or standalone intake calls it.
/**
 * Создаёт внутренний приёмник client payload: проверяет схему и актуальный consent,
 * затем дедуплицирует и публикует наблюдения. Ошибка публикации даёт unavailable; уже
 * сделанные claims и эффекты не откатываются.
 */
export const createClientPayloadIntake = ({
  emit,
  duplicate,
}: Readonly<{
  duplicate: (id: string) => boolean;
  emit: (
    event: Readonly<{
      analyticsEventId: string;
      operation: string;
      code: string;
      authority: "client_observed";
    }>,
  ) => void;
}>) => {
  return async ({
    payload,
    preference,
  }: PayloadIntakeInput): Promise<PayloadIntakeOutcome> => {
    const parsed = clientBatchSchema.safeParse(payload, { jitless: true });
    if (!parsed.success) return "invalid";
    if (!currentAll({ preference, ...parsed.data })) return "denied";
    try {
      emitAcceptedClientEvents({
        events: parsed.data.events,
        duplicate,
        emit,
      });
      return "accepted";
    } catch {
      return "unavailable";
    }
  };
};

/**
 * Создаёт standalone client intake с общим или собственным admission. Возвращённый
 * обработчик сначала расходует бюджет источника, затем проверяет payload и согласие;
 * превышение даёт rate_limited.
 */
export const createClientIntake = ({
  clock,
  emit,
  admission = createIntakeAdmission(clock),
}: Readonly<{
  clock: () => number;
  admission?: ReturnType<typeof createIntakeAdmission>;
  emit: Parameters<typeof createClientPayloadIntake>[0]["emit"];
}>) => {
  const accept = createClientPayloadIntake({
    emit,
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
