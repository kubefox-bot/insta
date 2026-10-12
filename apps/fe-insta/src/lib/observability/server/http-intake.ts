import { requestStreamCancellation } from "../../streams/server/index";
import { intakeStatus } from "../client/conts";
import { acceptHttpPayload } from "./accept-http-payload";
import { createFaroPayloadIntake } from "./faro";
import type { createIntakeAdmission } from "./intake";
import { createClientPayloadIntake } from "./intake";
import type { HttpIntakeInput } from "./types";

/**
 * Связывает HTTP intake обоих протоколов с общим admission. До чтения тела проверяет
 * лимит; при отказе запрашивает отмену stream без ожидания settlement. Остальные
 * запросы проходят чтение и consent; ответ содержит статус без тела и no-store.
 */
export const createHttpIntake = ({
  admission,
  emit,
  receiver,
}: Readonly<{
  admission: ReturnType<typeof createIntakeAdmission>;
  emit: Parameters<typeof createClientPayloadIntake>[0]["emit"];
  receiver: string | undefined;
}>) => {
  const handlers = {
    client: createClientPayloadIntake({ emit, duplicate: admission.duplicate }),
    faro: createFaroPayloadIntake({ receiver, duplicate: admission.duplicate }),
  };
  return async ({
    request,
    readPreference,
    source,
    protocol,
  }: HttpIntakeInput) => {
    if (!admission.admit(source)) {
      if (request.body) requestStreamCancellation(request.body);
      return new Response(null, {
        status: intakeStatus.rateLimited,
        headers: { "Cache-Control": "no-store" },
      });
    }
    const status = await acceptHttpPayload({
      request,
      readPreference,
      accept: handlers[protocol],
    });
    return new Response(null, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  };
};
