type StoriesCompose = {
  readonly capture: (args: readonly string[]) => Promise<string>;
};

/** Provision the configured private bucket in the already healthy RustFS service; a failure rejects startup before application launch. */
export const initializeStoriesStorage = async ({
  compose,
  build,
}: {
  readonly compose: StoriesCompose;
  readonly build: boolean;
}) =>
  compose.capture([
    "up",
    "--no-deps",
    "--force-recreate",
    build ? "--build" : "--no-build",
    "--abort-on-container-exit",
    "--exit-code-from",
    "stories-init",
    "stories-init",
  ]);
