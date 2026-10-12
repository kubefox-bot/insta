import type { RedisClient } from "bun";
import type { PrivacyDependencies } from "../../../domains/privacy/index";
import {
  createDragonflyPreferences,
  createRandom,
} from "../../../domains/privacy/server/index";
/** Создаёт offline privacy provider с явным отказом операций вместо фиктивного согласия. */
export const createUnavailablePrivacy = (): PrivacyDependencies => ({
  preferences: {
    /** Отклоняет чтение generation без runtime privacy infrastructure. */
    generation: async () => {
      throw new Error("Privacy unavailable in offline composition");
    },
    /** Отклоняет чтение preferences в offline-композиции, не выдавая недоступность за отсутствие записи. */
    find: async () => {
      throw new Error("Privacy unavailable in offline composition");
    },
    /** Отклоняет запись preferences в offline-композиции, не подтверждая несуществующее сохранение. */
    save: async () => {
      throw new Error("Privacy unavailable in offline composition");
    },
  },
  clock: Date.now,
  random: createRandom(),
});

/** Подключает privacy к заимствованному Dragonfly-клиенту и серверным часам/генератору случайности. */
export const createPrivacyDependencies = (
  broker: RedisClient,
): PrivacyDependencies => ({
  preferences: createDragonflyPreferences(broker),
  clock: Date.now,
  random: createRandom(),
});
