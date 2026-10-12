import { passwordAdmission } from "../../domain/conts";
import { validPassword } from "../../domain/policy";
import type { PasswordHasher } from "../../ports/password-hasher";
import { createPasswordAdmission } from "./admission";
import { dummyPasswordHash, passwordWork } from "./conts";
/**
 * Создаёт Argon2id-адаптер с собственным ограничителем параллелизма; слоты удерживаются
 * до фактического завершения Bun.password.
 */
export const createBunHasher = (): PasswordHasher => {
  const admission = createPasswordAdmission(passwordAdmission);
  return {
    /**
     * Проверяет допустимость пароля и вычисляет Argon2id hash; освобождает слот в finally
     * также при ошибке вычисления.
     */
    hash: async ({ password }) => {
      if (!validPassword(password)) throw new Error("Invalid password");
      const release = await admission.acquire();
      try {
        return await Bun.password.hash(password, {
          algorithm: "argon2id",
          memoryCost: passwordWork.memoryCostKiB,
          timeCost: passwordWork.timeCost,
        });
      } finally {
        release();
      }
    },
    /**
     * Для отсутствующего hash выполняет dummy-проверку и возвращает false; реальную
     * работу ограничивает permit, освобождая его после settlement.
     */
    verify: async ({ password, hash }) => {
      if (!validPassword(password)) return false;
      const release = await admission.acquire();
      try {
        const verified = await Bun.password.verify(
          password,
          hash ?? dummyPasswordHash,
          "argon2id",
        );
        return hash !== undefined && verified;
      } finally {
        release();
      }
    },
  };
};
