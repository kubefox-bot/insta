import { randomBytes } from "node:crypto";
import { lstat } from "node:fs/promises";
import { secureDirectory, writePrivateFile } from "./artifacts";
import { readComposeOrigin, readStoriesSetupConfig } from "./config";
import {
  localCertificatePolicy,
  mongoKeyBytes,
  privateUmask,
  secretBytes,
} from "./conts";
import { readHostSettings } from "./host/config";
import { environmentKeys } from "./host/conts";
import { ensureEnvironmentValues } from "./private-env";
import { storiesInfra } from "./stories/conts";

process.umask(privateUmask);
await secureDirectory(".infra");
await secureDirectory("infra/certs");
const storiesProfile = {
  id: storiesInfra.profile,
  endpoint: storiesInfra.endpoint,
  playbackEndpoint: readComposeOrigin(readHostSettings().httpsPort),
  bucket: storiesInfra.bucket,
  region: storiesInfra.region,
  prefix: storiesInfra.prefix,
  accessKeyId: randomBytes(secretBytes).toString("hex"),
  secretAccessKey: randomBytes(secretBytes).toString("hex"),
};
const { environment: storiesEnvironment } =
  readStoriesSetupConfig(storiesProfile);
await writePrivateFile({
  path: ".env",
  content: `${[
    "MONGO_ROOT_PASSWORD",
    "API_MONGO_PASSWORD",
    "WEB_MONGO_PASSWORD",
    "DRAGONFLY_PASSWORD",
    "DELIVERY_DRAGONFLY_PASSWORD",
    "AUTH_SIGNING_KEY",
    "SESSION_ENCRYPTION_KEY",
    "BFF_SOURCE_SIGNING_KEY",
  ]
    .map((key) => `${key}=${randomBytes(secretBytes).toString("hex")}`)
    .join("\n")}\n${Object.entries(storiesEnvironment)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`,
});
await ensureEnvironmentValues({
  path: ".env",
  values: {
    [environmentKeys.deliveryBrokerPassword]:
      randomBytes(secretBytes).toString("hex"),
    [environmentKeys.bffSourceSigningKey]:
      randomBytes(secretBytes).toString("hex"),
    ...storiesEnvironment,
  },
});
await writePrivateFile({
  path: ".infra/mongo-key",
  content: randomBytes(mongoKeyBytes).toString("base64"),
});
const certificateFiles = [
  "infra/certs/localhost.crt",
  "infra/certs/localhost.key",
];
const existingCertificates = await Promise.all(
  certificateFiles.map(async (path) => {
    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.uid !== process.getuid?.())
        throw new Error("Certificate must be an owned regular file");
      await writePrivateFile({ path, content: "" });
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return false;
      throw error;
    }
  }),
);
if (existingCertificates.some(Boolean) && !existingCertificates.every(Boolean))
  throw new Error("Incomplete existing certificate pair; refusing overwrite");
if (!existingCertificates.every(Boolean)) {
  const child = Bun.spawn(
    [
      "openssl",
      "req",
      "-x509",
      "-newkey",
      `rsa:${localCertificatePolicy.rsaBits}`,
      "-nodes",
      "-days",
      String(localCertificatePolicy.validityDays),
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
      "-keyout",
      "infra/certs/localhost.key",
      "-out",
      "infra/certs/localhost.crt",
    ],
    { stdout: "ignore", stderr: "pipe" },
  );
  if ((await child.exited) !== 0)
    throw new Error("Local certificate generation failed");
}
console.log(
  "Local configuration prepared; existing files preserved. System trust unchanged.",
);
const { readMongoBootstrap } = await import("./config");
await writePrivateFile({
  path: ".infra/mongo-users.json",
  content: JSON.stringify(await readMongoBootstrap()),
  mode: "replace",
});
