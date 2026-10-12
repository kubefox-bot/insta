import { type Choice, consentPolicyVersion } from "@insta/contracts/privacy";
import type { BrowserOwner } from "./types";

/**
 * Под общей блокировкой перечитывает ревизию и сохраняет выбор текущей политики; ошибки чтения
 * и сохранения остаются вызывающему коду.
 */
export const persistChoice = ({
  choice,
  preferences,
  synchronization,
}: Pick<BrowserOwner, "preferences" | "synchronization"> &
  Readonly<{ choice: Choice }>) =>
  synchronization.exclusive(async () => {
    const fresh = await preferences.read();
    return preferences.save({
      choice,
      policyVersion: consentPolicyVersion,
      ...(fresh.revision > 0 ? { expectedRevision: fresh.revision } : {}),
    });
  });
