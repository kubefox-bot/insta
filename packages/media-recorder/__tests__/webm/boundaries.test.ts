import { expect, test } from "bun:test";
import { repairWebmDuration } from "@insta/media-recorder/webm";
import { fixture } from "./fixture";

test("public subpath repairs real Bun Blob without FileReader", async () => {
  expect(typeof FileReader).toBe("undefined");
  const source = fixture();
  const repaired = await repairWebmDuration({
    blob: source.blob,
    elapsedMs: 900,
    maxBytes: 1_048_576,
  });
  expect(repaired.isOk()).toBe(true);
  if (repaired.isError()) throw new Error(repaired.getError().code);
  expect(repaired.get()).not.toBe(source.blob);
});

test("public WebM subpath bundles for browser and imports under SSR without browser globals", async () => {
  const built = await Bun.build({
    entrypoints: [new URL("./fixtures/public.ts", import.meta.url).pathname],
    target: "browser",
  });
  expect(built.success, built.logs.map(String).join("\n")).toBe(true);
  const artifact = built.outputs[0];
  if (!artifact) throw new Error("missing browser artifact");
  const source = `for (const name of ['window','navigator','FileReader']) Object.defineProperty(globalThis, name, {get(){throw new Error(name+' accessed in SSR')}}); ${await artifact.text()}`;
  const child = Bun.spawn([Bun.which("bun") ?? "bun", "-e", source], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = await new Response(child.stderr).text();
  expect(stderr).toBe("");
  expect(await child.exited).toBe(0);
});
