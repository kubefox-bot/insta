/** WebSocket-only handshake требует точный явный Origin; прежний polling Fetch Metadata fallback не применяется. */
export const acceptsRealtimeOrigin = ({
  headers,
  origin,
}: Readonly<{
  headers: Readonly<Record<string, unknown>>;
  origin: string;
}>) => headers.origin === origin;
