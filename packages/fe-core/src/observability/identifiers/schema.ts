import { z } from "zod";
// Match the standard UUID contract, including its nil/max sentinel values.
export const requestIdSchema = z.uuid();
