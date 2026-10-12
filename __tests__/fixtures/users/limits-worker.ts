import { createDragonflyAuthLimits } from "../../../apps/be-insta/src/domains/users/adapters/dragonfly/limits";
import { authLimits } from "../../../apps/be-insta/src/domains/users/domain/conts";
import { connectDragonfly } from "../../../apps/be-insta/src/lib/dragonfly/index";
import { readTestApiConfig } from "../environment";

const [limit, subject, countText] = process.argv.slice(2);
if (
  limit !== "otpEmail" &&
  limit !== "otpIp" &&
  limit !== "loginEmail" &&
  limit !== "loginIp"
)
  throw new Error("Invalid test limit");
if (!subject?.startsWith("auth01-"))
  throw new Error("Invalid synthetic subject");
const count = Number(countText);
if (!Number.isInteger(count) || count < 1 || count > authLimits[limit].maximum)
  throw new Error("Invalid test count");
const client = await connectDragonfly({
  config: readTestApiConfig().dragonfly,
});
try {
  const limits = createDragonflyAuthLimits({ client, key: "a".repeat(64) });
  const results = [];
  for (let index = 0; index < count; index += 1) {
    const result = await limits.consume({ limit, subject });
    if (result.isError()) throw new Error("Limit fixture unavailable");
    results.push(result.get());
  }
  process.stdout.write(JSON.stringify(results));
} finally {
  client.close();
}
