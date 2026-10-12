import { expect, test } from "bun:test";
import {
  portProbeError,
  selectProbeHost,
} from "../../scripts/infra/host/port-probe";
import {
  assertPortAvailable,
  assertUdpPortAvailable,
} from "../../scripts/infra/host/preflight";

const reserveTcp = (port: number) => {
  try {
    return Bun.listen({
      hostname: "0.0.0.0",
      port,
      socket: {
        open(socket) {
          socket.terminate();
        },
        data() {},
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "EADDRINUSE"
    )
      return undefined;
    throw error;
  }
};
const reserveUdp = async (port: number) => {
  try {
    return await Bun.udpSocket({ hostname: "0.0.0.0", port });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "EADDRINUSE"
    )
      return undefined;
    throw error;
  }
};

test.skipIf(process.platform !== "darwin").each([80, 443])(
  "Darwin TCP port%i preflight reflects actual low-port availability",
  async (port) => {
    const owner = reserveTcp(port);
    if (!owner) {
      await expect(assertPortAvailable({ port })).rejects.toThrow("occupied");
      return;
    }
    owner.stop(true);
    await expect(assertPortAvailable({ port })).resolves.toBeUndefined();
    const occupied = reserveTcp(port);
    if (!occupied) {
      await expect(assertPortAvailable({ port })).rejects.toThrow("occupied");
      return;
    }
    try {
      await expect(assertPortAvailable({ port })).rejects.toThrow("occupied");
      expect(occupied.port).toBe(port);
    } finally {
      occupied.stop(true);
    }
    await expect(assertPortAvailable({ port })).resolves.toBeUndefined();
  },
);

test.skipIf(process.platform !== "darwin")(
  "Darwin UDP443 preflight distinguishes availability from a held datagram port",
  async () => {
    const reservation = await reserveUdp(443);
    if (!reservation) {
      await expect(assertUdpPortAvailable({ port: 443 })).rejects.toThrow(
        "occupied",
      );
      return;
    }
    reservation.close();
    await expect(
      assertUdpPortAvailable({ port: 443 }),
    ).resolves.toBeUndefined();
    const owner = await reserveUdp(443);
    if (!owner) {
      await expect(assertUdpPortAvailable({ port: 443 })).rejects.toThrow(
        "occupied",
      );
      return;
    }
    try {
      await expect(assertUdpPortAvailable({ port: 443 })).rejects.toThrow(
        "occupied",
      );
      expect(owner.port).toBe(443);
    } finally {
      owner.close();
    }
    await expect(
      assertUdpPortAvailable({ port: 443 }),
    ).resolves.toBeUndefined();
  },
);

test("wildcard probing is limited to Darwin privileged ports", () => {
  expect(selectProbeHost({ platform: "darwin", port: 1023 })).toBe("0.0.0.0");
  expect(selectProbeHost({ platform: "darwin", port: 1024 })).toBe("127.0.0.1");
  expect(selectProbeHost({ platform: "darwin", port: 23000 })).toBe(
    "127.0.0.1",
  );
  expect(selectProbeHost({ platform: "linux", port: 80 })).toBe("127.0.0.1");
  expect(selectProbeHost({ platform: "win32", port: 443 })).toBe("127.0.0.1");
});

test("bind permission and unexpected failures retain their cause instead of claiming collision", () => {
  for (const code of ["EACCES", "EADDRNOTAVAIL"]) {
    const cause = Object.assign(new Error("Native bind failed"), { code });
    const error = portProbeError({ port: 80, protocol: "TCP", error: cause });
    expect(error.message).toContain(code);
    expect(error.message).not.toContain("occupied");
    expect(error.cause).toBe(cause);
  }
});

test("high UDP collision leaves its socket bound and releases only the temporary probe", async () => {
  const owner = await Bun.udpSocket({ hostname: "127.0.0.1", port: 0 });
  try {
    await expect(assertUdpPortAvailable({ port: owner.port })).rejects.toThrow(
      "occupied",
    );
    await expect(assertUdpPortAvailable({ port: owner.port })).rejects.toThrow(
      "occupied",
    );
  } finally {
    owner.close();
  }
  await expect(
    assertUdpPortAvailable({ port: owner.port }),
  ).resolves.toBeUndefined();
});
