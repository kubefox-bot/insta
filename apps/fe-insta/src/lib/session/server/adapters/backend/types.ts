export type BackendConfiguration = Readonly<{
  api: Readonly<{
    baseURL: string;
    timeoutMs: number;
    maxResponseBytes: number;
  }>;
  bffSourceSigningKey: string;
}>;
