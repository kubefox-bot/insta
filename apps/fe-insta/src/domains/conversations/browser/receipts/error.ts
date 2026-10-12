export class ReceiptRequestError extends Error {
  /** Сохраняет код, HTTP статус и исходный Retry-After для последующего решения о повторе квитанций. */
  constructor(
    readonly code: string,
    readonly status: number,
    readonly retryAfter?: string,
  ) {
    super(code);
  }
}
