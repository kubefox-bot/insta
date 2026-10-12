import type { z } from "zod";
import type { correlationSchema } from "./correlation.dto";
import type { envelopeSchema } from "./envelope.dto";
export type Correlation = z.infer<typeof correlationSchema>;
export type Envelope<Data, Error> = z.infer<
  ReturnType<typeof envelopeSchema<z.ZodType<Data>, z.ZodType<Error>>>
>;
