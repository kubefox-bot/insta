import { validateCommitMessage } from "@insta/fe-core/git/commit-message";

/** Проверяет только первую строку файла сообщения общим валидатором; ошибки чтения и замечания печатает в stderr и возвращает код отказа, не изменяя файл. */
const validateMessageFile = async (
  path: string | undefined,
): Promise<number> => {
  if (!path) {
    process.stderr.write(
      "Не удалось проверить commit message: отсутствует путь до файла.\n",
    );
    return 1;
  }
  try {
    const content = await Bun.file(path).text();
    const subject = (content.split("\n")[0] ?? "").replace(/\r$/, "").trimEnd();
    const issues = validateCommitMessage(subject);
    for (const issue of issues)
      process.stderr.write(`${issue.code}: ${issue.message}\n`);
    return issues.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(
      `Не удалось прочитать commit message: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
};

process.exit(await validateMessageFile(process.argv[2]));
