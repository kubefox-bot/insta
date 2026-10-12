import { expect, test } from "bun:test";
import { StoryPolicyController } from "../../../src/domains/stories/adapters/http/policy/controller";

test("public policy returns only authoritative policy and disabled Stories returns404", () => {
  const statuses: number[] = [];
  const headers: string[] = [];
  const response = {
    status: (code: number) => {
      statuses.push(code);
    },
    setHeader: (name: string, value: string) => {
      headers.push(`${name}:${value}`);
    },
  };
  const policy = {
    maxDurationMs: 10000,
    lifetimeMs: 3000000000,
    maxFileBytes: 20971520 as const,
    captureSafetyMarginMs: 200 as const,
  };
  const controller = new StoryPolicyController({ policy });
  expect(controller.read({}, response)).toMatchObject({
    ok: true,
    data: policy,
  });
  expect(headers).toEqual(["Cache-Control:no-store"]);
  expect(new StoryPolicyController(null).read({}, response)).toMatchObject({
    ok: false,
    error: { code: "DEPENDENCY_UNAVAILABLE" },
  });
  expect(statuses).toEqual([404]);
});
