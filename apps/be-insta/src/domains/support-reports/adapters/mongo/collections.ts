import { supportCollections } from "./conts";
/**
 * Выбирает production коллекции либо изолированные имена с проверенным префиксом
 * support_test_; произвольный namespace отклоняет.
 */
export const supportCollectionNames = (namespace?: string) => {
  if (!namespace) return supportCollections;
  if (!/^support_test_[a-z0-9_]+$/.test(namespace))
    throw new Error("Invalid support collection namespace");
  return {
    reports: `${namespace}_reports`,
    replays: `${namespace}_replays`,
    outbox: `${namespace}_outbox`,
  };
};
