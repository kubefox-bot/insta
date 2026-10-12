export type MessageMarkState =
  | Readonly<{ kind: "waiting" | "sent" }>
  | Readonly<{ kind: "delivered" | "read"; timestamp: string }>
  | Readonly<{ kind: "error"; code: string }>;
export type ReceiptEntry = {
  desired: number;
  confirmed: number;
  stopped: number;
};
