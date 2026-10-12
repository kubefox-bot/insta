export const setupFailure = ({
  error,
  cleanupError,
  message,
}: Readonly<{ error: unknown; cleanupError: unknown; message: string }>) =>
  new AggregateError([error, cleanupError], message, { cause: error });
