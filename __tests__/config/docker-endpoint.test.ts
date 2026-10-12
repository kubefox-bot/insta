import { expect, test } from "bun:test";
import { readDockerEndpoint } from "../../scripts/infra/config";

test("uses the selected Docker context when DOCKER_HOST is not set", () => {
  const endpoint = readDockerEndpoint({}, () => "unix:///var/run/docker.sock");

  expect(endpoint).toBe("unix:///var/run/docker.sock");
});

test("preserves explicit Unix and Windows Docker endpoints", () => {
  expect(
    readDockerEndpoint(
      { explicitEndpoint: "unix:///var/run/docker.sock" },
      () => {
        throw new Error("context lookup should not run");
      },
    ),
  ).toBe("unix:///var/run/docker.sock");
  expect(
    readDockerEndpoint({ explicitEndpoint: "npipe:////./pipe/docker_engine" }),
  ).toBe("npipe:////./pipe/docker_engine");
});

test.each(["tcp://docker.example:2376", "ssh://docker.example"])(
  "rejects non-local Docker endpoint %s",
  (endpoint) => {
    expect(() => readDockerEndpoint({ explicitEndpoint: endpoint })).toThrow(
      "A local Unix socket or Windows named pipe is required",
    );
  },
);
