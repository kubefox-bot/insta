import { Result } from "@bloodyowl/boxed";
import { MessageErrorCode } from "@insta/contracts/errors";
import { messageInputSchema } from "@insta/contracts/messages";
import { get, readonly, writable } from "svelte/store";
import type {
  Submission,
  SubmissionDependencies,
  SubmissionView,
} from "../types";

/** Владеет pending/issue отправки формы и защищает новый ввод от очистки поздним результатом; наружу отдаёт readable view и submit. */
export const createSubmission = ({
  text,
  disabled,
  send,
  change,
}: SubmissionDependencies): Submission => {
  const state = writable<SubmissionView>({ pending: false, issue: null });
  let disposed = false;
  /** Вызывает операцию принятия текста; исключение преобразует в ошибку сохранения очереди. */
  const attempt = async (submitted: string) => {
    try {
      return await send(submitted);
    } catch {
      return Result.Error("PERSISTENCE_FAILED" as const);
    }
  };
  /** Завершает pending живого контроллера и очищает поле только при успехе и неизменном с отправки тексте. */
  const settle = (
    submitted: string,
    result: Awaited<ReturnType<typeof attempt>>,
  ) => {
    if (disposed) return;
    const issue = result.isError() ? result.getError() : null;
    state.set({ pending: false, issue });
    if (issue === null && text() === submitted) change("");
  };
  /** Исключает повторный submit, проверяет текст по контракту и ожидает принятия сообщения, публикуя pending и ошибку. */
  const submit = async () => {
    if (disabled() || get(state).pending || disposed) return;
    const submitted = text();
    if (
      !messageInputSchema.safeParse({ text: submitted }, { jitless: true })
        .success
    ) {
      state.set({ pending: false, issue: MessageErrorCode.InvalidMessage });
      return;
    }
    state.set({ pending: true, issue: null });
    const result = await attempt(submitted);
    settle(submitted, result);
  };
  return {
    view: readonly(state),
    submit,
    /** Блокирует будущие отправки и применение позднего результата; уже запущенную операцию send не отменяет. */
    dispose: () => {
      disposed = true;
    },
  };
};
