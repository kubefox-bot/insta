export type SourceRequest = Readonly<{ method: string; pathname: string }>;
export type ClientSourceInput = SourceRequest &
  Readonly<{ headers: Readonly<Record<string, unknown>>; peer: string }>;
export type ClientSourceReader = (input: ClientSourceInput) => string;
