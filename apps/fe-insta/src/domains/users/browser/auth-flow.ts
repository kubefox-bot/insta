import type { SubmitFunction } from "$app/forms";
import { applyAction, deserialize } from "$app/forms";
import { invalidateAll } from "$app/navigation";
import { readRevocation } from "./lib/revocation";
import type { AuthBrowser } from "./types";
import { submitAuthAction } from "./use-cases/submit";

/**
 * Заменяет стандартную enhanced-отправку auth сценарным POST, применением SvelteKit action и
 * обновлением страниц; передаёт этап регистрации и статус отзыва без самостоятельной
 * авторизации.
 */
export const createAuthEnhance =
  ({
    auth,
    onPending,
    onStage,
  }: Readonly<{
    auth: AuthBrowser;
    onPending: (pending: boolean) => void;
    onStage?: (stage: string) => void;
  }>): SubmitFunction =>
  ({ cancel, formData, action, formElement }) => {
    cancel();
    onPending(true);
    return submitAuthAction({
      logout: formData.get("step") === "logout",
      ports: {
        auth,
        /**
         * Отправляет FormData как SvelteKit action, десериализует квитанцию и сообщает об
         * успешном этапе; HTTP-тело трактует по action-протоколу.
         */
        post: async () => {
          const response = await fetch(action, {
            method: "POST",
            body: formData,
            headers: {
              accept: "application/json",
              "x-sveltekit-action": "true",
            },
          });
          const receipt = deserialize(await response.text());
          if (
            receipt.type === "success" &&
            typeof receipt.data?.stage === "string"
          )
            onStage?.(receipt.data.stage);
          return {
            receipt,
            successful: receipt.type === "success",
            revocation:
              receipt.type === "success"
                ? readRevocation(receipt.data)
                : undefined,
          };
        },
        apply: applyAction,
        refresh: invalidateAll,
        /**
         * Очищает DOM-поля формы после успешного auth-действия.
         */
        reset: () => formElement.reset(),
        onPending,
      },
    }).then(() => undefined);
  };
