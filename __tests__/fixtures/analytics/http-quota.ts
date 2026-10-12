export const quotaClientBody = () =>
  JSON.stringify({
    revision: 1,
    policyVersion: 1,
    events: [
      {
        analyticsEventId: crypto.randomUUID(),
        operation: "frontend.ui",
        code: "UI_EFFECT_FAILED",
      },
    ],
    source: "CLIENT_CANNOT_SELECT_SOURCE",
  });

export const probeHttpQuota = async (
  send: (
    input: Readonly<{ path: string; body: string; contentType: string }>,
  ) => Promise<number>,
) => {
  const rejected: number[] = [];
  for (let index = 0; index < 20; index++)
    rejected.push(
      await send({
        path: "/api/telemetry",
        body: "{",
        contentType: "application/json",
      }),
    );
  for (let index = 0; index < 20; index++)
    rejected.push(
      await send({
        path: "/api/telemetry/faro",
        body: "invalid",
        contentType: "text/plain",
      }),
    );
  for (let index = 0; index < 19; index++)
    rejected.push(
      await send({
        path: "/api/telemetry",
        body: " ".repeat(16385),
        contentType: "application/json",
      }),
    );
  return {
    rejected,
    sixty: await send({
      path: "/api/telemetry",
      body: quotaClientBody(),
      contentType: "application/json",
    }),
    sixtyOne: await send({
      path: "/api/telemetry/faro",
      body: " ".repeat(65537),
      contentType: "application/json",
    }),
    sixtyTwo: await send({
      path: "/api/telemetry",
      body: quotaClientBody(),
      contentType: "application/json",
    }),
  };
};
