// Native probes share stdout with operational NDJSON. Their final report is a
// separate JSON value; parsing failures remain failures of the probe contract.
export const readProbeReport = (output: string): unknown =>
  JSON.parse(output.trim().split("\n").at(-1) ?? "");
