import {
  consentPolicyVersion,
  type PublicPreference,
} from "@insta/contracts/privacy";
/**
 * Создаёт исходный необходимый режим без подтверждённого выбора текущей политики.
 */
export const necessaryPreference = (): PublicPreference => ({
  choice: "necessary",
  policyVersion: consentPolicyVersion,
  revision: 0,
});
/**
 * Разрешает необязательную телеметрию только для сохранённого полного согласия действующей
 * версии политики.
 */
export const canStartOptional = (preference: PublicPreference) =>
  preference.choice === "all" &&
  preference.policyVersion === consentPolicyVersion &&
  preference.revision > 0;
