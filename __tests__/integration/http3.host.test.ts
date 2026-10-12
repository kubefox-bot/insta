import { expect, test } from "bun:test";
import { readInfraConfig } from "../../scripts/infra/config";
import { http3ClientImage } from "../../scripts/testing/conts";
import { docker } from "../fixtures/docker";

test("actual pinned QUIC client proves h3-only separately from HTTP2 on the local test network", async () => {
  const version = await docker(
    "run",
    "--pull",
    "never",
    "--rm",
    "--platform",
    "linux/amd64",
    "--network",
    "none",
    http3ClientImage,
    "/usr/local/bin/curl",
    "--version",
  );
  expect(version).toContain("HTTP3");
  for (const [mode, expected] of [
    ["--http3-only", "3 200"],
    ["--http2", "2 200"],
  ] as const) {
    const output = await docker(
      "run",
      "--pull",
      "never",
      "--rm",
      "--platform",
      "linux/amd64",
      "--network",
      `${readInfraConfig().project}_default`,
      http3ClientImage,
      "/usr/local/bin/curl",
      mode,
      "--insecure",
      "--silent",
      "--show-error",
      "--max-time",
      "15",
      "--connect-to",
      "localhost:443:traefik:443",
      "--output",
      "/dev/null",
      "--write-out",
      "%{http_version} %{http_code}",
      "https://localhost/api/health/ready",
    );
    expect(output).toBe(expected);
    console.log(
      JSON.stringify({
        mode,
        network: `${readInfraConfig().project}_default`,
        actual: output,
        clientImage: http3ClientImage,
        clientPlatform: "linux/amd64 emulated diagnostic client only",
        serverPlatform: "linux/arm64",
        boundary: "Docker local network; not host published UDP or Chrome h3",
        tls: "per-command insecure; no system trust",
      }),
    );
  }
}, 60000);
