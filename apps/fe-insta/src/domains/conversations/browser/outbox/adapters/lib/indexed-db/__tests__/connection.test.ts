import { expect, test } from "bun:test";
import { createConnection } from "../connection";
import { createDatabase, createFactory, run, succeed } from "./factory";

test("blocked open closes late success and allows retry", async () => {
  const fixture = createFactory();
  const connection = createConnection({
    factory: fixture.factory,
    databaseName: "owned",
  });
  const first = run(connection.run);
  const request = fixture.requests[0];
  if (!request) throw Error("Missing first request");
  request.onblocked?.call(
    request,
    new Event("blocked") as IDBVersionChangeEvent,
  );
  expect(await first).toBe("PERSISTENCE_FAILED");
  const second = run(connection.run);
  const firstDb = createDatabase();
  succeed(request, firstDb.database);
  expect(firstDb.counts.closes).toBe(1);
  const next = fixture.requests[1];
  expect(next).toBeDefined();
  if (!next) throw Error("Missing retry request");
  const secondDb = createDatabase();
  succeed(next, secondDb.database);
  expect(await second).toBe("done");
  expect(secondDb.counts.transactions).toBe(1);
  expect(firstDb.counts.transactions).toBe(0);
  connection.close();
});

test("error releases an attempt for explicit retry", async () => {
  const fixture = createFactory();
  const connection = createConnection({
    factory: fixture.factory,
    databaseName: "owned",
  });
  const pending = run(connection.run);
  const request = fixture.requests[0];
  if (!request) throw Error("Missing request");
  request.onerror?.call(request, new Event("error"));
  expect(await pending).toBe("PERSISTENCE_FAILED");
  const retry = run(connection.run);
  const next = fixture.requests[1];
  if (!next) throw Error("Missing retry");
  const db = createDatabase();
  succeed(next, db.database);
  expect((await retry) === "done").toBe(true);
  connection.close();
});

test("close before success settles callers and closes late owned handle once", async () => {
  const fixture = createFactory();
  const connection = createConnection({
    factory: fixture.factory,
    databaseName: "owned",
  });
  const pending = run(connection.run);
  connection.close();
  connection.close();
  expect(await pending).toBe("PERSISTENCE_FAILED");
  const request = fixture.requests[0];
  if (!request) throw Error("Missing request");
  const db = createDatabase();
  succeed(request, db.database);
  expect(db.counts.closes).toBe(1);
  expect(db.counts.transactions).toBe(0);
  expect((await run(connection.run)) === "PERSISTENCE_FAILED").toBe(true);
  expect(fixture.requests).toHaveLength(1);
});

test("concurrent callers share an open and versionchange permits a new handle", async () => {
  const fixture = createFactory();
  const connection = createConnection({
    factory: fixture.factory,
    databaseName: "owned",
  });
  const callers = [run(connection.run), run(connection.run)];
  expect(fixture.requests).toHaveLength(1);
  const request = fixture.requests[0];
  if (!request) throw Error("Missing request");
  const old = createDatabase();
  succeed(request, old.database);
  expect((await Promise.all(callers)).every((value) => value === "done")).toBe(
    true,
  );
  old.database.onversionchange?.call(
    old.database,
    new Event("versionchange") as IDBVersionChangeEvent,
  );
  expect(old.counts.closes).toBe(1);
  const retry = run(connection.run);
  const next = fixture.requests[1];
  if (!next) throw Error("Missing retry");
  const fresh = createDatabase();
  succeed(next, fresh.database);
  expect((await retry) === "done").toBe(true);
  expect(old.counts.transactions).toBe(2);
  connection.close();
  expect(fresh.counts.closes).toBe(1);
});

for (const release of ["close", "versionchange"] as const) {
  test(`success followed by ${release} before the await continuation never starts a transaction on the released handle`, async () => {
    const fixture = createFactory();
    const connection = createConnection({
      factory: fixture.factory,
      databaseName: "owned",
    });
    const pending = run(connection.run);
    const request = fixture.requests[0];
    if (!request) throw Error("Missing request");
    const old = createDatabase();
    succeed(request, old.database);
    if (release === "close") connection.close();
    else
      old.database.onversionchange?.call(
        old.database,
        new Event("versionchange") as IDBVersionChangeEvent,
      );
    expect(await pending).toBe("PERSISTENCE_FAILED");
    expect(old.counts.transactions).toBe(0);
    expect(old.counts.closes).toBe(1);
    const retry = run(connection.run);
    if (release === "close") {
      expect(await retry).toBe("PERSISTENCE_FAILED");
      expect(fixture.requests).toHaveLength(1);
    } else {
      const next = fixture.requests[1];
      if (!next) throw Error("Missing retry");
      const fresh = createDatabase();
      succeed(next, fresh.database);
      expect(await retry).toBe("done");
      expect(fresh.counts.transactions).toBe(1);
      connection.close();
      expect(fresh.counts.closes).toBe(1);
    }
  });
}
