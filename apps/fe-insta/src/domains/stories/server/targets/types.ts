export type ReadyTarget = Readonly<{
  type: "create_story" | "resume_story";
  operationId: string;
}>;
export type TargetActor = Readonly<{ userId: string; generation: string }>;
export type TargetIdentity = Readonly<{
  status: string;
  actor: TargetActor | null;
}>;
