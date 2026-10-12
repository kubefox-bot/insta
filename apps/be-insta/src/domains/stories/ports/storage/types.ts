export type SignedPlayback =
  | Readonly<{ kind: "signed"; url: string; expiresAt: number }>
  | Readonly<{ kind: "expired" }>;
