import { z } from "zod";
import { testResults } from "./conts";

export const testResultSchema = z.enum(testResults);
