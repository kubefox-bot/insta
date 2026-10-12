import type { WebmRepairError } from "./types";
export class WebmFailure extends Error {
  /** Сохраняет код ожидаемого отказа бинарного ремонта в Error для преобразования на публичной границе. */
  constructor(readonly code: WebmRepairError["code"]) {
    super(code);
  }
}
