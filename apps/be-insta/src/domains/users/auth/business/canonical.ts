import { authBusinessCatalog } from "./conts";
/**
 * Строит каноническое auth-событие для outbox из business catalog, связывая operationId и
 * backend session; отправку аналитики не выполняет.
 */
export const canonicalAuthEvent = ({
  kind,
  operationId,
  backendSessionId,
  committedAt,
  analyticsEventId = crypto.randomUUID(),
}: Readonly<{
  kind: keyof typeof authBusinessCatalog;
  operationId: string;
  backendSessionId: string;
  committedAt: number;
  analyticsEventId?: string;
}>) => ({
  ...authBusinessCatalog[kind],
  type: authBusinessCatalog[kind].goal ?? "session_rotated",
  authority: "server_canonical",
  operationId,
  analyticsEventId,
  effectId: backendSessionId,
  occurredAt: committedAt,
  backendSessionId,
  committedAt: new Date(committedAt),
});
