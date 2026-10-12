import { expect, test } from "bun:test";
import { get } from "svelte/store";
import { createSearchController } from "../lib/search-controller";
import type { SearchUsers } from "../types";

const alice = [{ id: "alice-id", username: "Alice" }];
const bob = [{ id: "bob-id", username: "Bob" }];
const setup = () => {
  const requests: Array<{
    q: string;
    signal: AbortSignal;
    response: ReturnType<typeof Promise.withResolvers<SearchUsers>>;
  }> = [];
  const delivered: SearchUsers[] = [];
  const controller = createSearchController({
    search: ({ q, signal }) => {
      const response = Promise.withResolvers<SearchUsers>();
      requests.push({ q, signal, response });
      return response.promise;
    },
    onResults: (users) => delivered.push(users),
  });
  const request = (index = 0) => {
    const item = requests[index];
    if (!item) throw new Error("Expected submitted search request");
    return item;
  };
  return { controller, requests, delivered, request };
};

test("editing only changes the view and trim-empty submission makes no request", async () => {
  const { controller, requests } = setup();
  controller.edit("Alice");
  expect(get(controller.view)).toEqual({ q: "Alice", status: "idle" });
  expect(requests).toHaveLength(0);
  controller.edit("   ");
  await controller.submit();
  expect(requests).toHaveLength(0);
  expect(get(controller.view).status).toBe("idle");
});

test("explicit submission normalizes the query and delivers current results once", async () => {
  const { controller, request, delivered } = setup();
  controller.edit(" Alice ");
  const submitted = controller.submit();
  expect(get(controller.view)).toEqual({ q: " Alice ", status: "loading" });
  expect(request().q).toBe("Alice");
  request().response.resolve(alice);
  await submitted;
  expect(get(controller.view)).toEqual({
    q: " Alice ",
    status: "ready",
    items: alice,
  });
  expect(delivered).toEqual([alice]);
});

for (const nextQuery of ["", "Bob"]) {
  test(`editing pending search to ${JSON.stringify(nextQuery)} immediately aborts and rejects its late result`, async () => {
    const { controller, request, delivered } = setup();
    controller.edit("Alice");
    const submitted = controller.submit();
    controller.edit(nextQuery);
    expect(request().signal.aborted).toBe(true);
    expect(get(controller.view)).toEqual({ q: nextQuery, status: "idle" });
    request().response.resolve(alice);
    await submitted;
    expect(get(controller.view)).toEqual({ q: nextQuery, status: "idle" });
    expect(delivered).toEqual([]);
  });
}

test("late A success cannot replace B results or notify their consumer", async () => {
  const { controller, request, delivered } = setup();
  controller.edit("Alice");
  const first = controller.submit();
  controller.edit("Bob");
  const second = controller.submit();
  request(1).response.resolve(bob);
  await second;
  request().response.resolve(alice);
  await first;
  expect(get(controller.view)).toEqual({
    q: "Bob",
    status: "ready",
    items: bob,
  });
  expect(delivered).toEqual([bob]);
});

test("late A failure cannot replace B loading or retire its duplicate-request guard", async () => {
  const { controller, requests, request } = setup();
  controller.edit("Alice");
  const first = controller.submit();
  controller.edit("Bob");
  const second = controller.submit();
  request().response.reject(new Error("Unavailable"));
  await first;
  await controller.submit();
  expect(get(controller.view)).toEqual({ q: "Bob", status: "loading" });
  expect(requests).toHaveLength(2);
  request(1).response.resolve(bob);
  await second;
});

test("repeat submit for the pending query makes one request", async () => {
  const { controller, requests, request } = setup();
  controller.edit("Alice");
  const first = controller.submit();
  await controller.submit();
  expect(requests).toHaveLength(1);
  request().response.resolve(alice);
  await first;
});

test("failure remains distinct from empty success and can be retried", async () => {
  const { controller, request, delivered } = setup();
  controller.edit("Alice");
  const first = controller.submit();
  request().response.reject(new Error("Unavailable"));
  await first;
  expect(get(controller.view)).toEqual({ q: "Alice", status: "error" });
  expect(delivered).toEqual([]);
  const retry = controller.submit();
  request(1).response.resolve([]);
  await retry;
  expect(get(controller.view)).toEqual({
    q: "Alice",
    status: "ready",
    items: [],
  });
  expect(delivered).toEqual([[]]);
  controller.edit("");
  expect(get(controller.view)).toEqual({ q: "", status: "idle" });
});

test("dispose aborts and blocks late delivery and further submissions", async () => {
  const { controller, requests, request, delivered } = setup();
  controller.edit("Alice");
  const submitted = controller.submit();
  controller.dispose();
  expect(request().signal.aborted).toBe(true);
  request().response.resolve(alice);
  await submitted;
  controller.edit("Bob");
  await controller.submit();
  expect(get(controller.view)).toEqual({ q: "", status: "idle" });
  expect(requests).toHaveLength(1);
  expect(delivered).toEqual([]);
});

test("edit immediately removes completed results and clear removes a current failure", async () => {
  const { controller, request } = setup();
  controller.edit("Alice");
  const first = controller.submit();
  request().response.resolve(alice);
  await first;
  controller.edit("Bob");
  expect(get(controller.view)).toEqual({ q: "Bob", status: "idle" });
  const second = controller.submit();
  request(1).response.reject(new Error("Unavailable"));
  await second;
  controller.edit("");
  expect(get(controller.view)).toEqual({ q: "", status: "idle" });
});
