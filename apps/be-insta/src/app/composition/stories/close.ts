/** Ждёт settlement всех Stories владельцев, освобождает media и затем передаёт ошибки. */
export const closeStoriesResources = async (
  input: Readonly<{
    publisher: () => Promise<void>;
    jobs: () => Promise<void>;
    publicationFeed: () => Promise<void>;
    infrastructure: () => Promise<void>;
  }>,
) => {
  const workers = await Promise.allSettled([
    Promise.resolve().then(input.publisher),
    Promise.resolve().then(input.jobs),
    Promise.resolve().then(input.publicationFeed),
  ]);
  const infrastructure = await Promise.allSettled([
    Promise.resolve().then(input.infrastructure),
  ]);
  const failures = [...workers, ...infrastructure].flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, "Stories shutdown incomplete");
};
