import type { PublicPreference } from "@insta/contracts/privacy";
import { consentPolicyVersion } from "@insta/contracts/privacy";
import { z } from "zod";
import { faroEndpoint, intakePolicy } from "../client/conts";
import { createFaroRuntime } from "./faro-runtime";

const capabilitySchema = z.strictObject({
  enabled: z.boolean(),
  revision: z.number().int().nonnegative(),
  policyVersion: z.number().int().positive(),
});
/**
 * Загружает SDK только при выборе all, актуальной policy и совпавшем подтверждении
 * доступности receiver. Отказ или ошибка probe возвращает пустой lifecycle без SDK;
 * ошибка самого import остаётся отклонением Promise.
 */
export const loadFaroAdapter = async ({
  preference,
}: Readonly<{ preference: PublicPreference }>) => {
  if (
    preference.choice !== "all" ||
    preference.revision <= 0 ||
    preference.policyVersion !== consentPolicyVersion
  )
    return {
      /**
       * Оставляет Faro выключенным: preference не разрешил загрузку SDK.
       */
      start: () => {},
      /**
       * Завершает пустой lifecycle без ресурсов: SDK не загружался из-за preference.
       */
      stop: () => {},
      /**
       * Ничего не очищает: отказ preference не создавал Faro instance.
       */
      clear: () => {},
    };
  const capability: unknown = await fetch(faroEndpoint, {
    credentials: "same-origin",
    signal: AbortSignal.timeout(intakePolicy.requestTimeoutMs),
  })
    .then((response) => response.json())
    .catch(() => undefined);
  const parsed = capabilitySchema.safeParse(capability, { jitless: true });
  if (
    !parsed.success ||
    !parsed.data.enabled ||
    parsed.data.revision !== preference.revision ||
    parsed.data.policyVersion !== preference.policyVersion
  )
    return {
      /**
       * Оставляет Faro выключенным: probe не подтвердил capability для данного preference.
       */
      start: () => {},
      /**
       * Завершает пустой lifecycle без ресурсов после неподтверждённого probe.
       */
      stop: () => {},
      /**
       * Ничего не очищает: после неподтверждённого probe instance не создавался.
       */
      clear: () => {},
    };
  // SDK is evaluated only after both the current preference and real receiver probe.
  const sdk = await import("@grafana/faro-web-sdk");
  return createFaroRuntime({ sdk, preference });
};
