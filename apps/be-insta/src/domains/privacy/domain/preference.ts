import {
  consentLifetimeMs,
  consentPolicyVersion,
} from "@insta/contracts/privacy";
import type { NativePreferenceView, Preference } from "./types";
/**
 * Проверяет срок, поколение хранилища и версию политики; нулевая ревизия не считается
 * сохранённым выбором.
 */
export const isCurrent = ({
  preference,
  generation,
  now,
}: Readonly<{ preference: Preference; generation: string; now: number }>) =>
  preference.revision > 0 &&
  preference.generation === generation &&
  preference.policyVersion === consentPolicyVersion &&
  preference.expiresAt > now;
/**
 * Формирует безопасный режим necessary с запросом нового выбора; разрешение на аналитику
 * не выдаётся.
 */
export const necessaryPreference = (): NativePreferenceView => ({
  choice: "necessary",
  policyVersion: consentPolicyVersion,
  revision: 0,
  needsChoice: true,
});
/**
 * Проецирует сохранённый выбор в публичное состояние без proof, идентификатора контекста
 * и служебных сроков.
 */
export const publicPreference = (
  preference: Preference,
): NativePreferenceView => ({
  choice: preference.choice,
  policyVersion: preference.policyVersion,
  revision: preference.revision,
  needsChoice: false,
});
/**
 * Сохраняет ссылку на действующий выбор; просроченный или относящийся к другому поколению
 * контекст отбрасывает.
 */
export const retainCurrent = ({
  preference,
  generation,
  now,
}: Readonly<{
  preference: Preference | undefined;
  generation: string;
  now: number;
}>) =>
  preference && isCurrent({ preference, generation, now })
    ? preference
    : undefined;
/**
 * Повышает ревизию выбора, сохраняя исходный срок действующего контекста; новому
 * контексту назначает срок политики.
 */
export const nextPreference = ({
  previous,
  contextId,
  choice,
  generation,
  now,
}: Readonly<{
  previous: Preference | undefined;
  contextId: string;
  choice: Preference["choice"];
  generation: string;
  now: number;
}>): Preference => ({
  contextId,
  choice,
  policyVersion: consentPolicyVersion,
  revision: (previous?.revision ?? 0) + 1,
  createdAt: previous?.createdAt ?? now,
  expiresAt: previous?.expiresAt ?? now + consentLifetimeMs,
  generation,
});
