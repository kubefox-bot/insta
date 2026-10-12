import { TerminationSignal } from "./codes";

export const terminationSignals: readonly TerminationSignal[] = [
  TerminationSignal.Interrupt,
  TerminationSignal.Terminate,
];
