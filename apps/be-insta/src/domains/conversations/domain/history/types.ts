import type { z } from "zod";
import type { Message } from "../types";
import type { cursorSchema } from "./cursor";
export type HistoryRange =
  | Readonly<{ direction: "recent" }>
  | Readonly<{ direction: "after"; sequence: number; watermark?: number }>
  | Readonly<{ direction: "before"; sequence: number; watermark: number }>;
export type Cursor = Readonly<z.output<typeof cursorSchema>>;
export type History = Readonly<{
  items: ReadonlyArray<Message>;
  pageInfo: Readonly<{ nextCursor: string | null; hasMore: boolean }>;
  baselineCursor: number;
  watermark: number;
}>;
