import { expect, test } from "bun:test";
import { connectNativeConsole } from "../../apps/fe-insta/src/lib/observability/console/index";

test("native console adapter never reads arbitrary arguments, contains sink failures and restores owned refs", () => {
  const original = (..._args: unknown[]) => {};
  const target = {
    log: original,
    info: original,
    debug: original,
    warn: original,
    error: original,
    trace: original,
  };
  const emit = () => {
    throw new Error("diagnostic unavailable");
  };
  const restore = connectNativeConsole({ target, emit });
  const secret = new Proxy(
    {},
    {
      get() {
        throw new Error("CANARY argument inspected");
      },
    },
  );
  const committed = { persisted: true };
  const execute = () => {
    target.error(secret);
    target.log(secret);
    return committed;
  };
  expect(execute()).toBe(committed);
  restore();
  restore();
  expect(target.log).toBe(original);
  expect(target.error).toBe(original);
});
