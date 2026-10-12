import { localeEndpoint, localeRequest, localeUnavailableError } from "./conts";

/** Сохраняет выбранный язык через существующий form endpoint. */
export const submitLocale = async (form: FormData): Promise<void> => {
  const response = await fetch(localeEndpoint, {
    ...localeRequest,
    body: form,
  });
  if (!response.ok) throw new Error(localeUnavailableError);
};
