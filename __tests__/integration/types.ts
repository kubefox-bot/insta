export type TestHttpApplication = {
  readonly listen: (port: number, host: string) => Promise<unknown>;
  readonly getUrl: () => Promise<string>;
  readonly close: () => Promise<void>;
  readonly getHttpAdapter: () => {
    readonly get: (
      path: string,
      handler: (
        request: unknown,
        response: { readonly json: (body: unknown) => unknown },
      ) => unknown,
    ) => unknown;
  };
};
