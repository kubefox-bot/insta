export type DeliveryProviderOptions = Readonly<{
  config: Readonly<{ url: string; timeoutMs: number }>;
  authIdentity: string;
}>;
