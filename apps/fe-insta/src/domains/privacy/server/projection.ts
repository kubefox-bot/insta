import type { PublicPreference } from "@insta/contracts/privacy";
// Native read includes a choice-needed flag; web transport has exactly three public fields.
/**
 * Ограничивает web-ответ выбором, версией политики и ревизией, исключая дополнительные поля
 * native-ответа.
 */
export const projectPreference = ({
  choice,
  policyVersion,
  revision,
}: PublicPreference): PublicPreference => ({ choice, policyVersion, revision });
