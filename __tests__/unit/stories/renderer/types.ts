export type DeferredContact = Readonly<{
  resolve: () => void;
  reject: () => void;
}>;
export type RendererCompiler = Readonly<{
  build: (
    options: Readonly<{
      configFile: false;
      root: string;
      base: string;
      plugins: readonly unknown[];
      resolve: Readonly<{ alias: Readonly<Record<string, string>> }>;
      css: Readonly<{ transformer: "lightningcss" }>;
      build: Readonly<{ outDir: string; emptyOutDir: true }>;
    }>,
  ) => Promise<unknown>;
}>;
