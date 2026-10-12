import { readonly, writable } from "svelte/store";
import { inputNames } from "./conts";
import type { AuthInputTransfer, InputValues } from "./types";
/**
 * Держит временный снимок полей auth-формы в памяти для переноса между представлениями;
 * принимающий компонент должен вызвать clear.
 */
export const createAuthInputTransfer = (): AuthInputTransfer => {
  const view = writable<InputValues | undefined>(undefined);
  return {
    view: readonly(view),
    /**
     * Считывает только разрешённые непустые поля DOM-формы, включая пароль, во временное
     * состояние переноса.
     */
    capture: (root) => {
      const values: Partial<Record<(typeof inputNames)[number], string>> = {};
      for (const name of inputNames) {
        const input = root.querySelector<HTMLInputElement>(
          `input[name="${name}"]`,
        );
        if (input?.value) values[name] = input.value;
      }
      view.set(values);
    },
    /**
     * Удаляет сохранённый снимок полей из transfer-store после использования или закрытия
     * формы.
     */
    clear: () => view.set(undefined),
  };
};
