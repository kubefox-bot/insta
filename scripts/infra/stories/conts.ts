export const storiesInfra = {
  image:
    "rustfs/rustfs:1.0.1@sha256:1803faef57627e2d9c2e7d89d655d712ddded5389040054987163043fecb6a3c",
  profile: "local-v1",
  bucket: "stories",
  region: "us-east-1",
  endpoint: "http://rustfs:9000",
  playbackEndpoint: "https://localhost",
  prefix: "stories/",
  configPath: ".infra/stories-storage.json",
  composePath: ".infra/stories-compose.json",
  dynamicPath: ".infra/stories-traefik.yml",
} as const;
export const provisioning = {
  timeoutMs: 10000,
  ok: 200,
  conflict: 409,
  forbidden: 403,
} as const;
