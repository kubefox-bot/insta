import type { createConnection } from "../connection";
export type SubscriptionDependencies = Readonly<{
  command: ReturnType<typeof createConnection>["command"];
  target:
    | Readonly<{ kind: "conversation"; id: string }>
    | Readonly<{ kind: "unread" | "stories" }>;
  current: () => boolean;
  uuid: () => string;
}>;
export type SubscriptionCommand = {
  [Type in import("../types").Command["type"]]: Omit<
    Extract<import("../types").Command, { type: Type }>,
    "meta" | "version" | "kind"
  >;
}[import("../types").Command["type"]];
