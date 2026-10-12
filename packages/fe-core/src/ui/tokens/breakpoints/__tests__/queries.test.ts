import { expect, test } from "bun:test";

test("derives complementary media queries at the public 48rem split boundary", async () => {
  const { breakpoints, mediaQueries } = await import("../index.ts");
  expect(breakpoints.splitViewMin).toBe("48rem");
  expect(mediaQueries).toEqual({
    compact: "(width < 48rem)",
    split: "(width >= 48rem)",
  });
});

test("imports the browser query API in a process without browser globals", async () => {
  const source = `if (typeof window !== 'undefined') throw new Error('Unexpected browser'); const { mediaQueries } = await import(${JSON.stringify(new URL("../index.ts", import.meta.url).href)}); console.log(mediaQueries.compact);`;
  const child = Bun.spawn([process.execPath, "--eval", source], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, output, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(error).toBe("");
  expect(exitCode).toBe(0);
  expect(output.trim()).toBe("(width < 48rem)");
});
