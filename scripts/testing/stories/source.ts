import { createHash } from "node:crypto";
/** Создаёт digest исходников, фактически присутствующих в checkout; пропускает удалённые cached paths при незавершённом Git rename. */
export const readAcceptanceSource = async () => {
  const files = Bun.spawn(
    ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [code, output, error] = await Promise.all([
    files.exited,
    new Response(files.stdout).text(),
    new Response(files.stderr).text(),
  ]);
  if (code) throw new Error(`Cannot inventory acceptance source: ${error}`);
  const candidates = [
    ...new Set(
      output
        .split("\0")
        .filter(
          (path) => path && !path.endsWith(".md") && !path.startsWith("docs/"),
        ),
    ),
  ].sort();
  const paths = (
    await Promise.all(
      candidates.map(async (path) => ({
        path,
        exists: await Bun.file(path).exists(),
      })),
    )
  )
    .filter(({ exists }) => exists)
    .map(({ path }) => path);
  const entries = await Promise.all(
    paths.map(async (path) => ({
      path,
      sha256: createHash("sha256")
        .update(new Uint8Array(await Bun.file(path).arrayBuffer()))
        .digest("hex"),
    })),
  );
  return {
    entries,
    hash: createHash("sha256").update(JSON.stringify(entries)).digest("hex"),
  };
};
