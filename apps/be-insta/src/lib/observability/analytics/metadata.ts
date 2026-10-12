import { AsyncLocalStorage } from "node:async_hooks";
import type { ConsentReference } from "@insta/fe-core/observability/analytics";

const metadata = new AsyncLocalStorage<ConsentReference | undefined>();
/** Изолирует снимок ссылки согласия в async-контексте операции; замороженная копия не меняет объект вызывающего кода. */
export const withAnalyticsReference = <T>({
  reference,
  execute,
}: Readonly<{
  reference: ConsentReference | undefined;
  execute: () => T;
}>): T => metadata.run(reference && Object.freeze({ ...reference }), execute);
/** Возвращает ссылку согласия только из текущего async-контекста; вне него согласие не предполагается. */
export const readAnalyticsReference = () => metadata.getStore();
