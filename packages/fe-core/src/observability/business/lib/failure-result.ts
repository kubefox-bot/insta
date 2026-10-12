import {
  CLIENT_ERROR_STATUS,
  SERVER_ERROR_STATUS,
} from "../../contracts/conts";
import { normalizeResult, record } from "../../normalize/normalize";
/** Выбирает код из ошибки либо fallback, затем нормализует retry/unknown по status; без кода возвращает undefined, без status использует failed/rejected категорию. */
export const readFailureResult = ({
  error,
  code,
  outcome,
}: Readonly<{
  error: unknown;
  code?: string;
  outcome: "pending" | "succeeded" | "failed" | "rejected";
}>) => {
  const payload = record(error);
  const selectedCode = typeof payload.code === "string" ? payload.code : code;
  if (!selectedCode) return undefined;
  const fallbackStatus =
    outcome === "failed" ? SERVER_ERROR_STATUS : CLIENT_ERROR_STATUS;
  const status =
    typeof payload.status === "number" && Number.isInteger(payload.status)
      ? payload.status
      : fallbackStatus;
  return normalizeResult({ ...payload, code: selectedCode }, status);
};
