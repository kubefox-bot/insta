import { expect, test } from "bun:test";
import { dockerFields as fields } from "../../scripts/infra/host/conts";
import { inspectFields } from "../../scripts/testing/conts";
import { validatePreparedApplication } from "../../scripts/testing/environment/inspect";

/** Создаёт самостоятельный Docker inspect fixture без credentials. */
const snapshot = () => {
  const labels: Record<string, string> = {
    "com.docker.compose.project": "insta-acceptance-full-aabbccddee11",
    "com.docker.compose.service": "be-insta",
    "com.docker.compose.project.working_dir": process.cwd(),
  };
  return {
    [fields.id]: "owned",
    [fields.image]: `sha256:${"a".repeat(64)}`,
    [fields.config]: { [fields.image]: "prepared", [fields.labels]: labels },
    [fields.state]: {
      [fields.running]: true,
      [fields.status]: "running",
      [fields.exitCode]: 0,
      [fields.startedAt]: "2026-10-20T00:00:00Z",
      [fields.finishedAt]: "0001-01-01T00:00:00Z",
      [fields.health]: { [fields.status]: "healthy" },
    },
    [inspectFields.mounts]: [],
    [fields.networkSettings]: { [fields.ports]: {}, [fields.networks]: {} },
  };
};
/** Пропускает недоверенный snapshot через настоящий production guard при фиксированном выбранном проекте. */
const check = (state: unknown) =>
  validatePreparedApplication({
    input: [state],
    expected: `sha256:${"a".repeat(64)}`,
    service: "be-insta",
    project: "insta-acceptance-full-aabbccddee11",
  });
test("prepared application accepts its exact image, healthy process and checkout labels", () => {
  expect(() => check(snapshot())).not.toThrow();
});
test("prepared application rejects another checkout, project, service and missing labels", () => {
  for (const [key, value] of [
    ["com.docker.compose.project.working_dir", "/foreign/checkout"],
    ["com.docker.compose.project", "insta-stories"],
    ["com.docker.compose.service", "fe-insta"],
  ] as const) {
    const state = snapshot();
    state.Config.Labels = { ...state.Config.Labels, [key]: value };
    expect(() => check(state)).toThrow();
  }
  const absent = snapshot();
  expect(() =>
    check({
      ...absent,
      [fields.config]: { ...absent.Config, [fields.labels]: null },
    }),
  ).toThrow();
});
test("prepared application still rejects wrong immutable images, missing readiness and source mounts", () => {
  const original = snapshot();
  for (const state of [
    { ...original, [fields.image]: `sha256:${"b".repeat(64)}` },
    {
      ...original,
      [fields.state]: { ...original.State, [fields.running]: false },
    },
    {
      ...original,
      [fields.state]: {
        ...original.State,
        [fields.health]: { [fields.status]: "unhealthy" },
      },
    },
    {
      ...original,
      [inspectFields.mounts]: [
        { [inspectFields.destination]: "/workspace/apps" },
      ],
    },
  ])
    expect(() => check(state)).toThrow();
});
