import type { AuthLimits } from "../../../ports/auth-limits";
import type { AuthDependencies } from "../../ports/dependencies";
export type AuthHttpDependencies = AuthDependencies &
  Readonly<{ limits: AuthLimits }>;
export type NativeRequest = Readonly<{
  method: string;
  path: string;
  socket: Readonly<{ remoteAddress?: string }>;
}>;
