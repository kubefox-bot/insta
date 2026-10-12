import { AwsClient } from "aws4fetch";
import { readStoriesProvisioningConfig } from "../config";
import { provisioning } from "./conts";

const config = readStoriesProvisioningConfig();
if (config.mode !== "enabled")
  throw new Error("Enabled Stories profile required");
for (const profile of config.profiles) {
  const client = new AwsClient({
    accessKeyId: profile.accessKeyId,
    secretAccessKey: profile.secretAccessKey,
    region: profile.region,
    service: "s3",
    retries: 0,
  });
  const response = await client.fetch(`${profile.endpoint}/${profile.bucket}`, {
    method: "PUT",
    signal: AbortSignal.timeout(provisioning.timeoutMs),
  });
  const body = await response.text();
  if (
    response.status !== provisioning.ok &&
    !(
      response.status === provisioning.conflict &&
      body.includes("<Code>BucketAlreadyOwnedByYou</Code>")
    )
  )
    throw new Error("Private Stories bucket preparation failed");
  const unsigned = await fetch(`${profile.endpoint}/${profile.bucket}`, {
    signal: AbortSignal.timeout(provisioning.timeoutMs),
  });
  await unsigned.body?.cancel();
  if (unsigned.status !== provisioning.forbidden)
    throw new Error("Stories bucket is not private");
}
console.log("Private Stories buckets ready.");
