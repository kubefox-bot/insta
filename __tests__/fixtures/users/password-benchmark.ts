import { createBunHasher } from "../../../apps/be-insta/src/domains/users/adapters/passwords/bun-hasher";
import { PasswordAdmissionError } from "../../../apps/be-insta/src/domains/users/index";

const hasher = createBunHasher();
const times: number[] = [];
const started = performance.now();
const outcomes = await Promise.all(
  Array.from({ length: 11 }, async () => {
    const begin = performance.now();
    try {
      await hasher.hash({ password: `synthetic-${crypto.randomUUID()}` });
      times.push(performance.now() - begin);
      return "hashed";
    } catch (error) {
      if (error instanceof PasswordAdmissionError) return "admission503";
      throw new Error("Benchmark cryptographic operation failed", {
        cause: error,
      });
    }
  }),
);
const status = await Bun.file("/proc/self/status").text();
const memory = await Bun.file("/proc/meminfo").text();
const processors = (await Bun.file("/proc/cpuinfo").text()).match(
  /^processor\s*:/gm,
)?.length;
const sorted = times.sort((a, b) => a - b);
const usage = process.resourceUsage();
const evidence = {
  bun: Bun.version,
  processors,
  vmMemTotalKiB: Number(memory.match(/MemTotal:\s+(\d+)/)?.[1]),
  vmMemAvailableKiBAfter: Number(memory.match(/MemAvailable:\s+(\d+)/)?.[1]),
  peakRssKiB: Number(status.match(/VmHWM:\s+(\d+)/)?.[1]),
  cpuTimeMs: Math.round((usage.userCPUTime + usage.systemCPUTime) / 1000),
  elapsedMs: Math.round(performance.now() - started),
  hashCompleted: outcomes.filter((outcome) => outcome === "hashed").length,
  admission503: outcomes.filter((outcome) => outcome === "admission503").length,
  minMs: Math.round(sorted[0] ?? 0),
  maxMs: Math.round(sorted.at(-1) ?? 0),
  p50Ms: Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0),
};
process.stdout.write(`${JSON.stringify(evidence)}\n`);
