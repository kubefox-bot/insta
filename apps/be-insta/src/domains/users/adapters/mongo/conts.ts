export const collections = {
  users: "users",
  proofs: "users_registration_proofs",
  sessions: "users_sessions",
  replays: "users_auth_replays",
  outbox: "users_outbox",
} as const;
export const transactionOptions = {
  readConcern: { level: "snapshot" },
  writeConcern: { w: "majority" },
} as const;
export const replayOperation = "completeRegistration";
export const duplicateKeyCode = 11000;
