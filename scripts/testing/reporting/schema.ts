import { z } from "zod";
import { testResultSchema } from "../schema";

const attempt = z.object({
  code: z.number().int(),
  evidence: z.array(z.string()),
  actual: z.string(),
});
export const testReportSchema = z.object({
  scope: z.enum(["core", "full"]),
  testRunId: z.string().uuid(),
  seed: z.string(),
  version: z.record(z.string(), z.string()),
  setup: z.object({
    result: testResultSchema,
    actual: z.string(),
    evidence: z.array(z.string()),
  }),
  phases: z.array(
    z.object({
      name: z.string(),
      paths: z.array(z.string()),
      coverage: z.enum(["full-owner", "filtered"]).optional(),
      result: testResultSchema,
      attempts: z.array(attempt),
      flake: z.boolean(),
    }),
  ),
  scenarios: z.array(
    z.object({
      scenarioId: z.string().regex(/^[AE]\d\d$/),
      scenarioPart: z.string(),
      required: z.boolean(),
      deferredReason: z.string().optional(),
      faultPoint: z.string(),
      expected: z.string(),
      actual: z.string(),
      result: testResultSchema,
      attempts: z.array(attempt),
      evidence: z.array(z.string()),
    }),
  ),
  coverageErrors: z.array(z.string()),
  accepted: z.boolean(),
});
