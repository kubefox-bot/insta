export type ServerOptions = {
  readonly environment?: Readonly<Record<string, string>>;
  readonly cwd: string;
  readonly args: readonly string[];
  readonly path: string;
  readonly assertResponse: (response: Response) => Promise<void>;
};
