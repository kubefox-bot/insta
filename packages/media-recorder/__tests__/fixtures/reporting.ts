export const withReportedErrors = async (
  operation: (errors: unknown[]) => Promise<void>,
) => {
  const errors: unknown[] = [];
  const original = Object.getOwnPropertyDescriptor(globalThis, "reportError");
  Object.defineProperty(globalThis, "reportError", {
    configurable: true,
    value: (cause: unknown) => errors.push(cause),
  });
  try {
    await operation(errors);
    await Promise.resolve();
  } finally {
    if (original) Object.defineProperty(globalThis, "reportError", original);
    else Reflect.deleteProperty(globalThis, "reportError");
  }
};
