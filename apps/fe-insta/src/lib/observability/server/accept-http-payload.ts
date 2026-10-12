import { intakeStatus } from "../client/conts";
import { readIntakePayload } from "./payload";
import type {
  HttpIntakeInput,
  PayloadIntakeInput,
  PayloadIntakeOutcome,
} from "./types";
/**
 * Читает ограниченный JSON payload, затем получает текущий preference и передаёт оба
 * значения приёмнику. Ошибка чтения preference трактуется как denied; ошибки accept не
 * перехватываются, его штатный исход переводится в HTTP status.
 */
export const acceptHttpPayload = async ({
  request,
  readPreference,
  accept,
}: Pick<HttpIntakeInput, "request" | "readPreference"> &
  Readonly<{
    accept: (input: PayloadIntakeInput) => Promise<PayloadIntakeOutcome>;
  }>) => {
  const read = await readIntakePayload(request);
  if (read.kind !== "parsed")
    return read.kind === "too_large"
      ? intakeStatus.tooLarge
      : intakeStatus.invalid;
  const preference = await readPreference().catch(() => null);
  if (!preference) return intakeStatus.denied;
  return intakeStatus[await accept({ payload: read.payload, preference })];
};
