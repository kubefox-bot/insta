// Mongo bootstrap owns this credentials-file boundary; values never enter logs.
const credentials = JSON.parse(
  require("node:fs").readFileSync("/run/secrets/mongo_users", "utf8"),
);
if (
  ![credentials.root, credentials.api, credentials.web].every(
    (value) => typeof value === "string" && value.length > 0,
  )
)
  throw new Error("Invalid Mongo bootstrap configuration");
const primaryPollMs = 200;
const admin = db.getSiblingDB("admin");
admin.auth("root", credentials.root);
try {
  rs.status();
} catch {
  rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "mongo:27017" }] });
}
while (!db.hello().isWritablePrimary) sleep(primaryPollMs);
for (const [database, username, password] of [
  ["insta_api", "insta_api", credentials.api],
  ["insta_web", "insta_web", credentials.web],
]) {
  const owner = db.getSiblingDB(database);
  if (!owner.getUser(username))
    owner.createUser({
      user: username,
      pwd: password,
      roles: [{ role: "readWrite", db: database }],
    });
}
