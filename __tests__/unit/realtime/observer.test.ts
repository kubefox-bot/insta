import { expect, test } from "bun:test";
import { createConnectionObserver } from "../../../apps/fe-insta/src/lib/realtime/index";

test("optional connection observation reads current permission and cannot break application behavior", () => {
  const recorded: unknown[] = [];
  let permission: "allowed" | "denied" = "denied";
  const observe = createConnectionObserver({
    readPermission: () => permission,
    record: (value: unknown) => {
      recorded.push(value);
    },
  });
  expect(observe({ kind: "connected" })).toBe("disabled");
  expect(recorded).toHaveLength(0);
  permission = "allowed";
  expect(observe({ kind: "connected" })).toBe("recorded");
  expect(recorded).toHaveLength(1);
  permission = "denied";
  expect(observe({ kind: "connected" })).toBe("disabled");
  expect(recorded).toHaveLength(1);
  const unavailable = createConnectionObserver({
    readPermission: () => "allowed",
    record: () => {
      throw new Error("Isolated optional observer error");
    },
  });
  expect(unavailable({ kind: "connected" })).toBe("unavailable");
});
