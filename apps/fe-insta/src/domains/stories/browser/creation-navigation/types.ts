export type CreationNavigationDependencies = Readonly<{
  navigate: (target: string) => Promise<void>;
  returnTarget?: string;
  authenticated: boolean;
}>;
