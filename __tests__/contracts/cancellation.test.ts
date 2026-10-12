import { expect, test } from "bun:test";

const fixture = new URL("./fixtures/cancellation.ts", import.meta.url).pathname;
const cases = [
  ["oversize", "pending", "10"],
  ["oversize", "rejected", "10"],
  ["html", "pending", "10"],
  ["html", "rejected", "10"],
  ["timeout", "pending", "10"],
  ["timeout", "rejected", "10"],
  ["oversize", "pending", "10000"],
  ["oversize", "rejected", "10000"],
] as const;
test.each(cases)(
  "%s preserves outcome/cleanup with %s cancel and %sms timeout",
  async (branch, cancellation, timeoutMs) => {
    const subprocess = Bun.spawn(
      [process.execPath, fixture, branch, cancellation, timeoutMs],
      { stdout: "pipe", stderr: "pipe", timeout: 500 },
    );
    const [output, errors, exit] = await Promise.all([
      new Response(subprocess.stdout).text(),
      new Response(subprocess.stderr).text(),
      subprocess.exited,
    ]);
    expect(exit, output + errors).toBe(0);
    expect(errors).toBe("");
    expect(JSON.parse(output)).toEqual({
      completed: true,
      error:
        branch === "timeout"
          ? { kind: "network" }
          : { kind: "invalid_contract", status: branch === "html" ? 502 : 200 },
      locked: false,
    });
  },
  1000,
);
