import { z } from "zod";
import { maxWireIdLength } from "./conts";

export const wireIdSchema = z.string().min(1).max(maxWireIdLength);
