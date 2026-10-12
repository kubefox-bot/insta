import { readStoriesConfig } from "../../../apps/be-insta/src/lib/config";
import type { AcceptanceConfig } from "../types";
import { verifyProfileApplications } from "./applications";
import { storiesAcceptance } from "./conts";
import { storiesProfileSchema } from "./schema";

export const validateStoriesProfile = ({
  profile,
  config,
}: Readonly<{ profile: unknown; config: AcceptanceConfig }>) => {
  const parsed = storiesProfileSchema.parse(profile);
  verifyProfileApplications({ profile: parsed, config });
  const host = parsed.services.testhost;
  if (
    host?.user !== "bun" ||
    host.working_dir !== "/workspace" ||
    host.volumes?.length !== 0
  )
    throw new Error(
      "Stories testhost requires bun, /workspace and zero mounts",
    );
  const backend = readStoriesConfig(
    parsed.services["be-insta"]?.environment ?? {},
  );
  const testhost = readStoriesConfig(host.environment ?? {});
  if (
    backend.mode !== "enabled" ||
    testhost.mode !== "enabled" ||
    JSON.stringify(backend) !== JSON.stringify(testhost)
  )
    throw new Error("Stories backend/testhost storage configuration differs");
  const storage = parsed.services.rustfs;
  if (
    storage?.image !== storiesAcceptance.storageImage ||
    JSON.stringify(storage.volumes) !==
      JSON.stringify([storiesAcceptance.storageVolume])
  )
    throw new Error(
      "Stories requires the pinned RustFS image and isolated storage volume",
    );
  return parsed;
};
