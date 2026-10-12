/** Узкий порт команд; соединением владеет вызывающее приложение. */
export type DragonflyCommands = Readonly<{
  send: (command: string, args: string[]) => Promise<unknown>;
  get: (key: string) => Promise<string | null>;
}>;
export type DragonflyNamespace = Readonly<{
  generationKey: string;
  keyPrefix: string;
}>;
export type GenerationInput = Readonly<{
  client: DragonflyCommands;
  namespace: DragonflyNamespace;
}>;
export type FencedInput = GenerationInput &
  Readonly<{
    generation: string;
    script: string;
    keys?: readonly string[];
    arguments?: readonly string[];
  }>;
