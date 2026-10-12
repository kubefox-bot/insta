import { openSupportForm, submitSupport } from "./adapters/http/submit";
import { createSupportForm } from "./use-cases/form";

/**
 * Собирает локальную форму поддержки с HTTP-портом и генератором ключей; жизненным циклом
 * формы управляет её вызывающий компонент.
 */
export const createSupportBrowser = () =>
  createSupportForm({
    transport: { openSupportForm, submitSupport },
    /**
     * Создаёт случайный идентификатор для новой попытки формы в браузере.
     */
    uuid: () => crypto.randomUUID(),
  });
