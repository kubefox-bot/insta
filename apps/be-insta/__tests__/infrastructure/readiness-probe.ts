import { createApplication } from "../../src/app/bootstrap";

const dependency = { ready: false };
const app = await createApplication({
  checkRequired: async () => dependency.ready,
  check: async () => ({
    ready: dependency.ready,
    mail: "degraded",
    delivery: "degraded",
  }),
  close: async () => {},
});
app
  .getHttpAdapter()
  .get("/probe", (_request, response) => response.json({ reached: true }));
app
  .getHttpAdapter()
  .post("/probe", (request, response) => response.json(request.body));
try {
  await app.listen(0, "127.0.0.1");
  const url = await app.getUrl();
  const live = await fetch(`${url}/health/live`),
    before = await fetch(`${url}/health/ready`),
    admission = await fetch(`${url}/probe`);
  dependency.ready = true;
  const ready = await fetch(`${url}/health/ready`),
    after = await fetch(`${url}/probe`),
    oversize = await fetch(`${url}/probe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x: "x".repeat(65536) }),
    });
  process.stdout.write(
    JSON.stringify({
      live: live.status,
      before: before.status,
      beforeBody: await before.json(),
      admission: admission.status,
      ready: ready.status,
      readyBody: await ready.json(),
      after: after.status,
      oversize: oversize.status,
    }),
  );
} finally {
  await app.close();
}
