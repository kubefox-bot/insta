import { installHooks } from "./install/apply.ts";

try {
  installHooks();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
}
