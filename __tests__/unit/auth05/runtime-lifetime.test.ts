import { expect, test } from "bun:test";

const readProbe = async (mode: string): Promise<unknown> => {
  const child = Bun.spawn(
    [process.execPath, "__tests__/unit/auth05/runtime-lifetime/probe.ts", mode],
    { stdout: "pipe", stderr: "pipe", timeout: 10000 },
  );
  const [exitCode, output, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(`Runtime probe failed: ${error}`);
  return JSON.parse(output);
};

test.each([
  { mode: "disposed-success", fetch: 1, navigate: 0 },
  { mode: "disposed-rejection", fetch: 1, navigate: 0 },
  { mode: "disposed-navigation", fetch: 1, navigate: 1 },
  { mode: "resume-after-dispose", fetch: 0, navigate: 0 },
  { mode: "generation-success", fetch: 1, navigate: 0 },
  { mode: "generation-rejection", fetch: 1, navigate: 0 },
])(
  "actual runtime fences $mode and retains the root-owned selected snapshot",
  async ({ mode, fetch, navigate }) => {
    expect(await readProbe(mode)).toEqual({
      result: false,
      calls: { fetch, navigate, resumed: 0, rejected: 0 },
      generation: mode.startsWith("generation")
        ? "changed-generation"
        : "same-generation",
      recoveryKind: "ready",
      restored: [],
      pendingText: "root-owned private draft",
    });
  },
);

test.each([
  {
    mode: "active-success",
    result: true,
    navigate: 1,
    resumed: 1,
    rejected: 0,
    recoveryKind: "idle",
    restored: ["root-owned private draft"],
  },
  {
    mode: "active-rejection",
    result: false,
    navigate: 0,
    resumed: 0,
    rejected: 1,
    recoveryKind: "unavailable",
    restored: [],
  },
])(
  "actual live runtime preserves normal $mode outcomes",
  async ({ mode, ...expected }) => {
    expect(await readProbe(mode)).toEqual({
      result: expected.result,
      calls: {
        fetch: 1,
        navigate: expected.navigate,
        resumed: expected.resumed,
        rejected: expected.rejected,
      },
      generation: "same-generation",
      recoveryKind: expected.recoveryKind,
      restored: expected.restored,
      pendingText: null,
    });
  },
);
