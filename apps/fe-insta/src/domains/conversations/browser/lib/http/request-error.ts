/** Сохраняет HTTP status и Retry-After независимо от формата тела ошибки BFF. */
export class ConversationRequestError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs: number | undefined,
    code: string,
  ) {
    super(code);
  }
}
