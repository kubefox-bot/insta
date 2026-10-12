import { isIP } from "node:net";
import { egressPolicy } from "./conts";

const number = (address: string) => {
  if (isIP(address) !== 4)
    throw new Error("Egress requires an actual IPv4 subnet");
  return address
    .split(".")
    .reduce((value, part) => value * 256 + Number(part), 0);
};
const address = (value: number) =>
  [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
export const selectEgressAddress = ({
  subnet,
  occupied,
}: Readonly<{ subnet: string; occupied: ReadonlySet<string> }>) => {
  const [base, suffix] = subnet.split("/");
  const prefix = Number(suffix);
  if (
    !base ||
    !suffix ||
    !Number.isInteger(prefix) ||
    prefix < egressPolicy.minimumPrefix ||
    prefix > egressPolicy.maximumPrefix
  )
    throw new Error("Unsupported egress IPv4 subnet");
  const start = number(base);
  const size = 2 ** (32 - prefix);
  if (start % size !== 0) throw new Error("Egress subnet is not canonical");
  for (
    let offset = 2;
    offset < Math.min(size - 1, egressPolicy.poolSize + 2);
    offset++
  ) {
    const candidate = address(start + size - offset);
    if (!occupied.has(candidate)) return candidate;
  }
  throw new Error("Egress address pool exhausted; refusing IP reuse");
};
