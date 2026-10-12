export const mixedFaroBody = ({
  exceptions,
  measurements,
}: Readonly<{ exceptions: number; measurements: number }>) => ({
  meta: { app: { name: "fe-insta" } },
  exceptions: Array.from({ length: exceptions }, () => ({
    type: "Error",
    value: "UNHANDLED_ERROR",
    timestamp: "2026-10-09T00:00:00.000Z",
  })),
  measurements: Array.from({ length: measurements }, () => ({
    type: "web-vitals",
    values: Object.fromEntries([["FCP", 1]]),
    timestamp: "2026-10-09T00:00:00.000Z",
  })),
});
