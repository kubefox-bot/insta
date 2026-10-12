import type { PublicPreference } from "@insta/contracts/privacy";
import { readTelemetryConfig } from "../../../../lib/config/server/index";
import { probeFaroReceiver } from "../../../../lib/observability/server/faro";
import { createHttpIntake } from "../../../../lib/observability/server/index";
import { createIntakeAdmission } from "../../../../lib/observability/server/intake";
import { readObservability } from "../runtime";

const admission = createIntakeAdmission(Date.now);
const config = readTelemetryConfig();
/**
 * Общий HTTP intake использует процессные admission и deduplication для client/Faro
 * протоколов; consent проверяется при приёме, no-store ответ и отмена отклонённого body
 * принадлежат intake.
 */
export const receiveTelemetry = createHttpIntake({
  admission,
  ...config,
  /**
   * Передаёт допущенное intake событие в общий серверный observability runtime для регистрации
   * client observation.
   */
  emit: (event) => readObservability().clientObserved(event),
});
/**
 * Разрешает Faro только при полном согласии с положительной revision и успешной проверке
 * receiver; без согласия сетевую проверку не выполняет.
 */
export const telemetryEnabled = async (preference: PublicPreference) =>
  preference.choice === "all" &&
  preference.revision > 0 &&
  (await probeFaroReceiver(config.receiver));
