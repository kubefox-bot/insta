import { inspectSource } from "./inspect-source";
import { createInspectionPool } from "./pool";
/**
 * Собирает production media inspector с ограниченным пулом и lifecycle close для packet
 * worker и decoder операций.
 */
export const createMediaInspector = () =>
  createInspectionPool({ inspectSource });
