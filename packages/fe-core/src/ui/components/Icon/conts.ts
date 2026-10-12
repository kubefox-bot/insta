import { actionPaths } from "../../icons/actions/conts";
import { navigationPaths } from "../../icons/navigation/conts";
import { statusPaths } from "../../icons/status/conts";
import type { MessengerIconName } from "../../icons/types";

export const messengerPaths = {
  search: actionPaths.search,
  clear: actionPaths.clear,
  close: actionPaths.close,
  send: actionPaths.send,
  camera: actionPaths.camera,
  plus: actionPaths.plus,
  back: navigationPaths.back,
  settings: navigationPaths.settings,
  clock: statusPaths.clock,
  check: statusPaths.check,
  "double-check": statusPaths.doubleCheck,
  error: statusPaths.error,
} as const satisfies Record<MessengerIconName, readonly string[]>;
