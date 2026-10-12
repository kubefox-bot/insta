import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { MessageErrorCode } from "@insta/contracts/errors";
import { get } from "svelte/store";
import { createSubmission } from "../lib/submission";
import type { Props } from "../props";

const setup = () => {
  let text = "First draft";
  let disabled = false;
  const requests: Array<
    Readonly<{
      text: string;
      response: ReturnType<
        typeof Promise.withResolvers<Awaited<ReturnType<Props["send"]>>>
      >;
    }>
  > = [];
  const controller = createSubmission({
    text: () => text,
    disabled: () => disabled,
    change: (next) => {
      text = next;
    },
    send: (submitted) => {
      const response =
        Promise.withResolvers<Awaited<ReturnType<Props["send"]>>>();
      requests.push({ text: submitted, response });
      return response.promise;
    },
  });
  const request = () => {
    const current = requests[0];
    if (!current) throw new Error("Expected composer request");
    return current;
  };
  return {
    controller,
    requests,
    request,
    edit: (next: string) => {
      text = next;
    },
    read: () => text,
    disable: () => {
      disabled = true;
    },
  };
};

test("pending send claims once and preserves a new draft after successful settlement", async () => {
  const { controller, requests, request, edit, read } = setup();
  const pending = controller.submit();
  expect(get(controller.view)).toEqual({ pending: true, issue: null });
  await controller.submit();
  expect(requests).toHaveLength(1);
  expect(request().text).toBe("First draft");
  edit("New draft");
  request().response.resolve(Result.Ok(undefined));
  await pending;
  expect(read()).toBe("New draft");
  expect(get(controller.view)).toEqual({ pending: false, issue: null });
});

test("success clears only the unchanged submitted draft", async () => {
  const { controller, request, read } = setup();
  const pending = controller.submit();
  request().response.resolve(Result.Ok(undefined));
  await pending;
  expect(read()).toBe("");
});

for (const reject of [false, true]) {
  test(`${reject ? "rejected Promise" : "Boxed queue failure"} retains text and allows an explicit retry`, async () => {
    const { controller, request, requests, read } = setup();
    const pending = controller.submit();
    if (reject) request().response.reject(new Error("Disk unavailable"));
    else request().response.resolve(Result.Error("QUEUE_FULL"));
    await pending;
    expect(read()).toBe("First draft");
    expect(get(controller.view)).toEqual({
      pending: false,
      issue: reject ? "PERSISTENCE_FAILED" : "QUEUE_FULL",
    });
    const retry = controller.submit();
    expect(requests).toHaveLength(2);
    requests[1]?.response.resolve(Result.Ok(undefined));
    await retry;
    expect(read()).toBe("");
  });
}

test("canonical wire validation rejects whitespace, overlimit and lone surrogates without send", async () => {
  const { controller, edit, requests, read } = setup();
  for (const invalid of [" \n\t\u2003", "😀".repeat(4001), "\ud800"]) {
    edit(invalid);
    await controller.submit();
    expect(requests).toHaveLength(0);
    expect(get(controller.view).issue).toBe(MessageErrorCode.InvalidMessage);
    expect(read()).toBe(invalid);
  }
  edit("😀".repeat(4000));
  const pending = controller.submit();
  expect(requests).toHaveLength(1);
  requests[0]?.response.resolve(Result.Ok(undefined));
  await pending;
});

test("disabled and disposed composers never send or clear after late settlement", async () => {
  const blocked = setup();
  blocked.disable();
  await blocked.controller.submit();
  expect(blocked.requests).toHaveLength(0);
  const { controller, request, requests, read } = setup();
  const pending = controller.submit();
  expect(requests).toHaveLength(1);
  controller.dispose();
  request().response.resolve(Result.Ok(undefined));
  await pending;
  expect(read()).toBe("First draft");
  await controller.submit();
  expect(requests).toHaveLength(1);
});
