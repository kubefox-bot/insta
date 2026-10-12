import { mkdir, open, unlink } from "node:fs/promises";
import { z } from "zod";
import { egressPolicy } from "./conts";
import { selectEgressAddress } from "./select";

const ledgerSchema = z.object({
  owner: z.literal(egressPolicy.ledgerOwner),
  leases: z.array(
    z.object({
      address: z.ipv4(),
      expiresAt: z.number().positive(),
      runId: z.string().startsWith("insta-egress-"),
    }),
  ),
});
export const reserveEgressAddress = async ({
  directory,
  subnet,
  occupied,
  runId,
  now,
}: Readonly<{
  directory: string;
  subnet: string;
  occupied: ReadonlySet<string>;
  runId: string;
  now: number;
}>) => {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = `${directory}/leases.json`;
  const lockPath = `${directory}/allocation.lock`;
  const lock = await open(lockPath, "wx", 0o600).catch((cause) => {
    throw new Error(
      "Egress allocation lock exists or is unavailable; no lease mutation",
      { cause },
    );
  });
  try {
    const ledger = (await Bun.file(path).exists())
      ? ledgerSchema.parse(await Bun.file(path).json())
      : { owner: egressPolicy.ledgerOwner, leases: [] };
    const leases = ledger.leases.filter((lease) => lease.expiresAt > now);
    const unavailable = new Set([
      ...occupied,
      ...leases.map((lease) => lease.address),
    ]);
    const address = selectEgressAddress({ subnet, occupied: unavailable });
    const file = await open(path, "w", 0o600);
    try {
      await file.writeFile(
        JSON.stringify(
          {
            owner: egressPolicy.ledgerOwner,
            leases: [
              ...leases,
              { address, runId, expiresAt: now + egressPolicy.leaseMs },
            ],
          },
          null,
          2,
        ),
      );
    } finally {
      await file.close();
    }
    return address;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
};
